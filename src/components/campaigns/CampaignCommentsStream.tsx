// CampaignCommentsStream — live comment thread for a published campaign card.
// Strict workspace isolation: queries `engagement_events` with the active
// user_id (RLS also enforces it). Matches on external_post_id when the
// campaign log has a provider_message_id, otherwise falls back to a time-
// windowed lookup around the campaign's created_at.
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, ChevronDown, ChevronUp, RefreshCw, Send, Smile, Meh, Frown, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { campaignMatchesExternalPost, getCampaignPostIds, platformForCampaignChannel } from "@/lib/campaignPostIds";
import { learnFromEdit } from "@/lib/learnFromEdit";

const extractFunctionError = async (error: any, fallback = "שגיאת API חיצונית") => {
  const status = error?.context?.status ?? error?.status;
  let details: any = null;
  try {
    details = error?.context?.clone ? await error.context.clone().json() : null;
  } catch { /* ignore */ }
  const msg = details?.error || details?.api_errors?.[0]?.payload?.message || details?.mapping_errors?.[0]?.error || error?.message || fallback;
  return `${status ? `HTTP ${status}: ` : ""}${msg}`;
};

const firstPipelineError = (data: any): string | null => {
  const api = Array.isArray(data?.api_errors) ? data.api_errors[0] : null;
  const mapping = Array.isArray(data?.mapping_errors) ? data.mapping_errors[0] : null;
  if (api) return `Meta ${api.status ?? ""}: ${api.payload?.message ?? api.error ?? "API rejected request"}`;
  if (mapping) return mapping.error ?? "Invalid external post id mapping";
  return null;
};

// Detect Meta OAuthException 190 / subcode 467 ("session invalid - user logged out")
// anywhere in the pipeline payload so we can render a friendly "renew connection"
// panel instead of a raw API error string.
const isFbSessionExpired = (data: any): boolean => {
  const apis = Array.isArray(data?.api_errors) ? data.api_errors : [];
  for (const a of apis) {
    const p = a?.payload ?? a?.error ?? {};
    const err = p?.error ?? p;
    const code = Number(err?.code);
    const sub = Number(err?.error_subcode ?? err?.subcode);
    const type = String(err?.type ?? "");
    const msg = String(err?.message ?? "");
    if (code === 190 || sub === 467 || type === "OAuthException" || /session.*invalid|logged out/i.test(msg)) {
      return true;
    }
  }
  return false;
};


type EngagementRow = {
  id: string;
  user_id: string;
  platform: string;
  sender_handle: string | null;
  inbound_text: string | null;
  ai_reply_text: string | null;
  status: string;
  sentiment: string | null;
  external_id: string | null;
  external_post_id: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
  is_archived?: boolean | null;
};

type CommentRow = EngagementRow & {
  parent_id: string | null;
  sender_avatar_url: string | null;
  message: string | null;
};

const cleanRelationId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") return null;
  return trimmed;
};

const avatarFromRow = (row: EngagementRow): string | null => {
  const meta = (row.metadata as any) ?? {};
  return (
    meta?.sender_avatar_url ||
    meta?.profile_image ||
    meta?.author?.profile_image ||
    meta?.author?.picture ||
    meta?.profile_picture_url ||
    meta?.from?.picture?.data?.url ||
    null
  );
};


type Props = {
  userId: string;
  campaign: {
    id: string;
    campaign_name: string;
    channel: string;
    message_body?: string | null;
    created_at: string;
    provider_message_id?: string | null;
    provider_response?: any;
  };
  commentCount?: number;
  onLiveCountResolved?: (campaignId: string, count: number) => void;
  onCountersResolved?: (campaignId: string, counters: { like_count?: number; share_count?: number; comment_count?: number; force?: boolean }) => void;
  /** Bump to trigger a manual refresh from a parent-owned button. */
  refreshSignal?: number;
  /** Hide the internal header (button + title) — used when parent renders its own controls. */
  hideHeader?: boolean;
};


const sentimentClass = (s: string | null) =>
  s === "positive"
    ? "bg-emerald-100 text-emerald-700"
    : s === "negative"
    ? "bg-rose-100 text-rose-700"
    : "bg-muted text-muted-foreground";

const sentimentLabel = (s: string | null) =>
  s === "positive" ? "חיובי" : s === "negative" ? "שלילי" : s ? "ניטרלי" : "—";

// In-memory + sessionStorage cache for engagement_event rows keyed by
// campaign id. Lets the comments panel render instantly on re-open while a
// background delta-refresh pulls fresh rows from Ayrshare without flashing
// the "טוען תגובות חיות…" loader.
const COMMENT_CACHE = new Map<string, EngagementRow[]>();
const cacheKey = (campaignId: string) => `realtyz.comments.${campaignId}`;
const readCache = (campaignId: string): EngagementRow[] | null => {
  if (COMMENT_CACHE.has(campaignId)) return COMMENT_CACHE.get(campaignId)!;
  try {
    const raw = sessionStorage.getItem(cacheKey(campaignId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EngagementRow[];
    if (!Array.isArray(parsed)) return null;
    COMMENT_CACHE.set(campaignId, parsed);
    return parsed;
  } catch { return null; }
};
const writeCache = (campaignId: string, rows: EngagementRow[], postIds: string[] = []) => {
  COMMENT_CACHE.set(campaignId, rows);
  try { sessionStorage.setItem(cacheKey(campaignId), JSON.stringify(rows)); } catch { /* quota */ }
  // Mirror into the postId-keyed slot using ETERNAL storage (localStorage)
  // so loaded comment trees survive page refresh, tab close/reopen, and
  // route re-entry. A subsequent silent refresh only ever merges/increments
  // — see the union below — and never wipes the cached array to zero.
  for (const pid of postIds) {
    if (!pid) continue;
    try {
      const perPostKey = `realtyz_fb_comments_cache_${pid}`;
      let existing: EngagementRow[] = [];
      try {
        const raw = localStorage.getItem(perPostKey);
        existing = raw ? (JSON.parse(raw) as EngagementRow[]) : [];
        if (!Array.isArray(existing)) existing = [];
      } catch { existing = []; }
      const incoming = rows.filter((r) => r.external_post_id === pid);
      const existingLooksPlaceholder = existing.length === 0 || existing.every((r: any) => !r?.id && !r?.external_id && !r?.inbound_text);
      if (incoming.length > 0 && existingLooksPlaceholder) {
        localStorage.setItem(perPostKey, JSON.stringify(incoming));
        continue;
      }
      const byId = new Map<string, EngagementRow>();
      for (const r of existing) byId.set(r.id, r);
      for (const r of incoming) byId.set(r.id, { ...(byId.get(r.id) ?? r), ...r });
      const merged = Array.from(byId.values()).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      // Only write if the merged set is non-empty OR the slot was empty.
      // This guarantees a transient empty fetch never wipes a populated cache.
      if (merged.length > 0 || existing.length === 0) {
        localStorage.setItem(perPostKey, JSON.stringify(merged));
      }
    } catch { /* quota */ }
  }
};

// Per-postId provider-fetch throttle. Ayrshare caps at 300 calls / 5min per
// profile and Udi's account was previously flagged for repeated bursts —
// silent re-mounts (collapse/expand of the card, route revisits, background
// refreshes) must NOT spam the API. We persist the last provider-fetch
// timestamp per post id in sessionStorage so it survives across cards and
// across page reloads inside the same browser session.
const PROVIDER_FETCH_LOCK_MS = 15 * 60 * 1000; // 15 minutes
const providerLockKey = (pid: string) => `realtyz_fb_comments_lock_${pid}`;
const purgeEmptyPerPostCacheBlocks = (pids: string[]): boolean => {
  let purged = false;
  for (const pid of pids) {
    if (!pid) continue;
    try {
      const perPostKey = `realtyz_fb_comments_cache_${pid}`;
      const raw = localStorage.getItem(perPostKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length !== 0) continue;
      localStorage.removeItem(perPostKey);
      localStorage.removeItem(providerLockKey(pid));
      purged = true;
    } catch { /* ignore malformed cache */ }
  }
  return purged;
};
const isProviderFetchLocked = (pids: string[], { manual = false }: { manual?: boolean } = {}): boolean => {
  if (manual) return false; // explicit user refresh always bypasses the lock
  if (!pids.length) return false;
  const now = Date.now();
  try {
    // Locked only when EVERY post id has a fresh lock — if any one is stale
    // or missing, allow the refresh (it scopes to all ids in one call).
    return pids.every((pid) => {
      const raw = localStorage.getItem(providerLockKey(pid));
      if (!raw) return false;
      const ts = Number(raw);
      return Number.isFinite(ts) && now - ts < PROVIDER_FETCH_LOCK_MS;
    });
  } catch { return false; }
};
const stampProviderFetch = (pids: string[]) => {
  const now = String(Date.now());
  for (const pid of pids) {
    if (!pid) continue;
    try { localStorage.setItem(providerLockKey(pid), now); } catch { /* quota */ }
  }
};

// ONE-SHOT GLOBAL WIPE — runs exactly once per browser after the workspace
// migrated to a fresh Ayrshare profile. Removes every stale per-post comment
// cache and provider-fetch lock so the new healthy connection starts from a
// completely clean slate (Udi's previous profile was permanently locked for
// monthly-unsuspension overuse). Bump the sentinel to run another wipe.
const WIPE_SENTINEL_KEY = "realtyz_fb_cache_wipe_v3_new_profile";
(function purgeLegacyAyrshareCaches() {
  try {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(WIPE_SENTINEL_KEY) === "1") return;
    const drop: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith("realtyz_fb_")) {
        drop.push(k);
      }
    }
    for (const k of drop) localStorage.removeItem(k);
    localStorage.setItem(WIPE_SENTINEL_KEY, "1");
  } catch { /* quota / private mode */ }
})();

// Per-campaign draft cache (suggested + user-edited public/DM text), keyed by
// engagement row id. Persisted to sessionStorage so collapse/expand of the
// card and any background refresh re-hydrate the exact last text the broker
// saw — including manual edits — for the entire browser session.
type DraftMap = Record<string, { pub: string; dm: string }>;
const DRAFT_CACHE = new Map<string, DraftMap>();
const draftKey = (campaignId: string) => `realtyz.drafts.${campaignId}`;
const readDraftCache = (campaignId: string): DraftMap => {
  if (DRAFT_CACHE.has(campaignId)) return DRAFT_CACHE.get(campaignId)!;
  try {
    const raw = sessionStorage.getItem(draftKey(campaignId));
    const parsed = raw ? JSON.parse(raw) : {};
    const map: DraftMap = parsed && typeof parsed === "object" ? parsed : {};
    DRAFT_CACHE.set(campaignId, map);
    return map;
  } catch { return {}; }
};
const writeDraftCache = (campaignId: string, map: DraftMap) => {
  DRAFT_CACHE.set(campaignId, map);
  try { sessionStorage.setItem(draftKey(campaignId), JSON.stringify(map)); } catch { /* quota */ }
};

export function CampaignCommentsStream({ userId, campaign, commentCount, onLiveCountResolved, onCountersResolved, refreshSignal, hideHeader }: Props) {
  const cached = readCache(campaign.id);
  const [rows, setRows] = useState<EngagementRow[] | null>(cached);

  // Surface live row count to the parent so the post-card header counter
  // reflects what the comment tree actually loaded (and matches Meta Graph
  // reality, not a stale Ayrshare analytics number).
  useEffect(() => {
    if (!onLiveCountResolved) return;
    if (!Array.isArray(rows)) return;
    onLiveCountResolved(campaign.id, rows.length);
  }, [rows, campaign.id, onLiveCountResolved]);

  const [loading, setLoading] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [providerWarning, setProviderWarning] = useState<string | null>(null);
  const [fbSessionExpired, setFbSessionExpired] = useState(false);

  const [replyOpen, setReplyOpen] = useState<EngagementRow | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [dmDraft, setDmDraft] = useState("");
  // Originals returned by the AI edge function — used to detect manual edits on publish.
  const [originalReply, setOriginalReply] = useState("");
  const [originalDm, setOriginalDm] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendPublic, setSendPublic] = useState(true);
  const [sendDm, setSendDm] = useState(true);
  const [finalizingPub, setFinalizingPub] = useState(false);
  const [finalizingDm, setFinalizingDm] = useState(false);

  const finalizeReplyText = async (channel: "pub" | "dm") => {
    if (!replyOpen) return;
    const edited = channel === "pub" ? replyDraft : dmDraft;
    const original = channel === "pub" ? originalReply : originalDm;
    if (!edited.trim()) return;
    const setBusy = channel === "pub" ? setFinalizingPub : setFinalizingDm;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("finalize-text", {
        body: {
          edited_text: edited,
          original_text: original,
          context: [
            `Campaign: ${campaign.campaign_name ?? ""}`,
            replyOpen.inbound_text ? `Inbound comment: ${replyOpen.inbound_text}` : null,
            campaign.message_body ? `Original post:\n${campaign.message_body}` : null,
          ]
            .filter(Boolean)
            .join("\n\n"),
          purpose: channel === "pub" ? "public_comment" : "private_dm",
        },
      });
      if (error) throw error;
      const finalText = (data as any)?.final_text;
      if (typeof finalText !== "string" || !finalText.trim()) {
        throw new Error((data as any)?.error || "לא התקבלה גרסה סופית");
      }
      const next = finalText.trim();
      if (channel === "pub") {
        setReplyDraft(next);
        setOriginalReply(next);
        setDraftCache((prev) => ({ ...prev, [replyOpen.id]: { pub: next, dm: dmDraft } }));
      } else {
        setDmDraft(next);
        setOriginalDm(next);
        setDraftCache((prev) => ({ ...prev, [replyOpen.id]: { pub: replyDraft, dm: next } }));
      }
      toast.success("נוצרה גרסה סופית");
    } catch (e: any) {
      toast.error(e?.message || "יצירת גרסה סופית נכשלה");
    } finally {
      setBusy(false);
    }
  };
  // Per-row cached AI drafts so closing/re-opening the editor does NOT
  // re-invoke the AI — only an explicit refresh-per-card regenerates.
  const [draftCache, setDraftCache] = useState<Record<string, { pub: string; dm: string }>>(() => readDraftCache(campaign.id));

  // Write-through draft cache to sessionStorage so the suggested + edited
  // text survives card collapse/expand and background refreshes.
  useEffect(() => {
    writeDraftCache(campaign.id, draftCache);
  }, [campaign.id, draftCache]);

  // Capture live edits to the open row's drafts (after the AI has produced
  // an initial pair) so manual changes are remembered too.
  useEffect(() => {
    if (!replyOpen) return;
    const existing = draftCache[replyOpen.id];
    if (!existing) return; // wait until AI has seeded the pair
    if (existing.pub === replyDraft && existing.dm === dmDraft) return;
    setDraftCache((prev) => ({ ...prev, [replyOpen.id]: { pub: replyDraft, dm: dmDraft } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyDraft, dmDraft, replyOpen?.id]);
  const postIds = useMemo(() => getCampaignPostIds(campaign), [campaign.channel, campaign.provider_message_id, campaign.provider_response]);
  const postIdsKey = postIds.join("|");

  const fetchRows = async () => {
    let q = supabase
      .from("engagement_events")
      .select(
        "id, user_id, platform, sender_handle, inbound_text, ai_reply_text, status, sentiment, external_id, external_post_id, metadata, created_at, is_archived",
      )
      .eq("user_id", userId)
      // NOTE: do NOT filter on is_archived — incoming comments are not
      // guaranteed to be initialized to false, and archived AI rows still
      // belong on the thread for full visibility.
      .order("created_at", { ascending: true })
      .limit(500);

    if (postIds.length > 0) {
      // Explicit String() guards against any int/text coercion mismatch.
      q = q.in("external_post_id", postIds.map((p) => String(p)));

    } else {
      const from = new Date(campaign.created_at).toISOString();
      const to = new Date(
        new Date(campaign.created_at).getTime() + 30 * 86400_000,
      ).toISOString();
      q = q
        .eq("platform", campaign.channel)
        .gte("created_at", from)
        .lte("created_at", to);
    }
    const { data, error } = await q;
    if (error) throw error;
    const incoming = (data ?? []) as EngagementRow[];
    // Append-only delta merge: keep every cached/existing row, overlay updates
    // by id, and append brand-new ids. The tree never flickers, collapses, or
    // resets to an empty state mid-refresh — only NEW comments slide in.
    setRows((prev) => {
      const byId = new Map<string, EngagementRow>();
      for (const r of prev ?? []) byId.set(r.id, r);
      for (const r of incoming) byId.set(r.id, { ...(byId.get(r.id) ?? {} as EngagementRow), ...r });
      const merged = Array.from(byId.values()).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      writeCache(campaign.id, merged, postIds);
      return merged;
    });
  };



  // On mount / when the active post id resolves, run an explicit query
  // against engagement_events. The realtime subscription only delivers NEW
  // rows — existing comments must come from this fetch.
  const load = async () => {
    // Only show the spinner on a true cold-start. If we already have a cached
    // tree in state/sessionStorage, render it instantly and let the refresh
    // happen silently in the background.
    const hasCached = Array.isArray(rows) && rows.length > 0;
    if (!hasCached) setLoading(true);
    try {
      await fetchRows();
    } catch (e: any) {
      console.error("[CampaignCommentsStream] initial fetch failed", {
        campaign_id: campaign.id,
        postIds,
        error: e?.message ?? String(e),
      });
      // Never blow away an existing cached tree on a transient fetch failure —
      // only seed an empty list when there was nothing to render in the first place.
      if (!hasCached) {
        toast.error(e?.message ?? "טעינת תגובות נכשלה");
        setRows([]);
      }
    } finally {
      if (!hasCached) setLoading(false);
    }
  };



  // Manual refresh ONLY. Background/auto invocations were removed after Udi's
  // Ayrshare profile got suspended for rate-limit burst. A 60-second hard
  // throttle (in addition to the 15-min localStorage lock) blocks rapid
  // re-clicks even when manual=true.
  const lastManualRefreshAtRef = useRef<number>(0);
  const forceRefresh = async ({ manual = false }: { manual?: boolean } = {}) => {
    if (!manual) {
      // HARD RULE (post-suspension): non-manual callers are NEVER allowed to
      // hit Ayrshare. Provider data only loads on an explicit user click.
      return;
    }
    const now = Date.now();
    const elapsed = now - lastManualRefreshAtRef.current;
    if (lastManualRefreshAtRef.current > 0 && elapsed < 60_000) {
      const wait = Math.ceil((60_000 - elapsed) / 1000);
      toast.message(`רענון ידני זמין שוב בעוד ${wait} שניות`);
      return;
    }
    if (isProviderFetchLocked(postIds, { manual })) {
      return;
    }
    // HARD RESET on manual click: evict every per-post cache + lock entry so
    // the next provider hit bypasses every stale-failure cached state from
    // the previously suspended Ayrshare token.
    if (manual) {
      for (const pid of postIds) {
        try {
          localStorage.removeItem(`realtyz_fb_comments_cache_${pid}`);
          localStorage.removeItem(providerLockKey(pid));
        } catch { /* quota */ }
      }
      COMMENT_CACHE.delete(campaign.id);
      try { sessionStorage.removeItem(cacheKey(campaign.id)); } catch { /* quota */ }
    }
    stampProviderFetch(postIds);

    setManualRefreshing(true);
    try {
      setProviderWarning(null);
      const pid = postIds[0] ?? null;
      const settled = await Promise.allSettled([
        supabase.functions.invoke("ayrshare-analytics", {
          body: pid ? { provider_message_id: pid } : {},
        }),
        postIds.length > 0
          ? supabase.functions.invoke("ayrshare-comments-fetch", {
              body: { post_ids: postIds, platform: platformForCampaignChannel(campaign.channel), campaign_body: campaign.message_body ?? null, force_refresh: manual },
            })
          : supabase.functions.invoke("ayrshare-sync-comments", { body: {} }),
      ]);
      let sawSessionExpired = false;
      let sawHalt = false;
      for (const result of settled) {
        if (result.status === "rejected") {
          console.warn("[CampaignCommentsStream] provider refresh rejected", result.reason);
          continue;
        }
        const { data, error } = result.value as any;
        if (error) {
          console.warn("[CampaignCommentsStream] provider refresh error", { error, data });
          continue;
        }
        if (isFbSessionExpired(data)) sawSessionExpired = true;
        if (data?.halt === true || data?.rate_limited === true || data?.suspended === true) {
          sawHalt = true;
        }
        const surfacedError = firstPipelineError(data);
        if (surfacedError) console.warn("[CampaignCommentsStream] provider pipeline warning", surfacedError);
      }
      setFbSessionExpired(sawSessionExpired);
      if (sawHalt) {
        // Ayrshare returned 429/403 — freeze further provider hits for 5
        // minutes by setting the manual debounce stamp way into the future.
        lastManualRefreshAtRef.current = Date.now() + 5 * 60_000 - 60_000;
        toast.error("מערכת הסנכרון בהפסקה זמנית להגנת החשבון");
      }

      await fetchRows();

      // Re-read the freshly overwritten counters from campaign_logs and bubble
      // them up so the outer card badges (likes / shares / comments) repaint
      // immediately — independent of the realtime UPDATE channel, which can
      // silently drop frames if publication is disabled for the table.
      if (onCountersResolved && postIds.length > 0) {
        try {
          const { data: rows } = await supabase
            .from("campaign_logs")
            .select("like_count, share_count, comment_count, provider_message_id")
            .eq("user_id", userId)
            .in("provider_message_id", postIds);
          const max = (key: "like_count" | "share_count" | "comment_count") =>
            (rows ?? []).reduce((acc, r: any) => Math.max(acc, Number(r?.[key] ?? 0) || 0), 0);
          onCountersResolved(campaign.id, {
            like_count: max("like_count"),
            share_count: max("share_count"),
            comment_count: max("comment_count"),
            force: true,
          });
        } catch (counterErr) {
          console.warn("[CampaignCommentsStream] counter bubble-up failed", counterErr);
        }
      }
    } catch (e: any) {
      console.warn("[CampaignCommentsStream] manual refresh failed", e);
    } finally {
      // Debounce window starts when the request COMPLETES (success or fail),
      // not when the user clicked — prevents rapid retries during slow calls.
      lastManualRefreshAtRef.current = Date.now();
      setManualRefreshing(false);
    }
  };

  // Parent-driven manual refresh: bump refreshSignal to trigger the same
  // forceRefresh path used by the (now hidden) internal button.
  const lastHandledSignalRef = useRef<number | undefined>(refreshSignal);
  useEffect(() => {
    if (refreshSignal === undefined) return;
    if (lastHandledSignalRef.current === refreshSignal) return;
    lastHandledSignalRef.current = refreshSignal;
    void forceRefresh({ manual: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);




  useEffect(() => {
    // SAFETY: load cached DB rows only — NEVER auto-hit Ayrshare on mount.
    // The broker must click "רענן" to pull fresh provider data.
    (async () => {
      const hadEmptyPerPostCache = purgeEmptyPerPostCacheBlocks(postIds);
      if (hadEmptyPerPostCache) {
        COMMENT_CACHE.delete(campaign.id);
        try { sessionStorage.removeItem(cacheKey(campaign.id)); } catch { /* quota */ }
        setRows(null);
      }
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id, postIdsKey, campaign.channel]);


  // When the parent's counter bumps (analytics realtime patch on
  // campaign_logs), immediately pull the new comments into the tree.
  useEffect(() => {
    if (typeof commentCount !== "number") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentCount]);


  useEffect(() => {
    const channel = supabase
      .channel(`engagement_events:${userId}:${campaign.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "engagement_events", filter: `user_id=eq.${userId}` },
        (payload) => {
          const changed = (payload.new || payload.old) as Partial<EngagementRow> | null;
          if (!changed || !campaignMatchesExternalPost(campaign, changed.external_post_id)) return;

          setRows((prev) => {
            const current = prev ?? [];
            let next: EngagementRow[];
            if (payload.eventType === "DELETE" || (payload.new as any)?.is_archived) {
              next = current.filter((row) => row.id !== changed.id);
            } else {
              const nextRow = payload.new as EngagementRow;
              const exists = current.some((row) => row.id === nextRow.id);
              next = exists
                ? current.map((row) => (row.id === nextRow.id ? nextRow : row))
                : [...current, nextRow];
              next = next.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            }
            writeCache(campaign.id, next, postIds);
            return next;
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, campaign.id, postIdsKey, campaign.channel]);

  const comments = useMemo<CommentRow[]>(() => {
    const all = rows ?? [];
    const byRelationId = new Map<string, EngagementRow>();
    all.forEach((row) => {
      byRelationId.set(row.id, row);
      const externalId = cleanRelationId(row.external_id);
      if (externalId) byRelationId.set(externalId, row);
    });

    return all.map((row) => {
      const meta = (row.metadata as any) ?? {};
      const rawParentId = cleanRelationId((row as any).parent_id) ?? cleanRelationId(meta.parent_id);
      const parentRow = rawParentId ? byRelationId.get(rawParentId) : null;
      const parentId = parentRow?.id === row.id ? null : parentRow?.id ?? rawParentId;

      return {
        ...row,
        parent_id: parentId,
        sender_avatar_url: (row as any).sender_avatar_url ?? avatarFromRow(row),
        message: row.inbound_text ?? "",
      };
    });
  }, [rows]);

  const commentIdSet = useMemo(() => new Set(comments.map((c) => c.id)), [comments]);
  const rootComments = useMemo(
    () => comments.filter((c) => !c.parent_id || !commentIdSet.has(c.parent_id)),
    [comments, commentIdSet],
  );
  const childReplies = useMemo(
    () => comments.filter((c) => c.parent_id && commentIdSet.has(c.parent_id)),
    [comments, commentIdSet],
  );
  const childrenByParent = useMemo(() => {
    const map = new Map<string, CommentRow[]>();
    childReplies.forEach((reply) => {
      if (!reply.parent_id) return;
      const current = map.get(reply.parent_id) ?? [];
      current.push(reply);
      map.set(reply.parent_id, current);
    });
    return map;
  }, [childReplies]);

  // Whenever the modal mounts on a new comment, force a fresh live invocation
  // of suggest-comment-reply with a cache-bust token. Closing the modal wipes
  // the draft state so the next open starts from a clean tree.
  useEffect(() => {
    if (!replyOpen) {
      setReplyDraft("");
      setDmDraft("");
      setOriginalReply("");
      setOriginalDm("");
      setDrafting(false);
      return;
    }
    // If we already have a cached draft for this row, hydrate from it and
    // skip the AI call entirely. The user can hit the per-card refresh to
    // regenerate.
    const cached = draftCache[replyOpen.id];
    if (cached) {
      setReplyDraft(cached.pub);
      setDmDraft(cached.dm);
      setOriginalReply(cached.pub);
      setOriginalDm(cached.dm);
      setDrafting(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setReplyDraft("");
      setDmDraft("");
      setOriginalReply("");
      setOriginalDm("");
      setDrafting(true);
      try {
        const { data, error } = await supabase.functions.invoke(
          "suggest-comment-reply",
          {
            body: {
              inbound_text: replyOpen.inbound_text,
              platform: replyOpen.platform,
              sender_handle: replyOpen.sender_handle,
              user_id: userId,
              campaign_context: [
                `Campaign: ${campaign.campaign_name}`,
                campaign.message_body ? `Published post:\n${campaign.message_body}` : null,
              ].filter(Boolean).join("\n\n"),
              campaign_post_body: campaign.message_body ?? null,
              regenerate: false,
            },
          },
        );
        if (cancelled) return;
        if (error) throw error;
        const pub = (data as any)?.public_comment ?? (data as any)?.draft;
        const dm = (data as any)?.private_messenger_dm ?? "";
        if (typeof pub === "string" && pub.trim()) {
          const pubTrim = pub.trim();
          const dmTrim = typeof dm === "string" ? dm.trim() : "";
          setReplyDraft(pubTrim);
          setDmDraft(dmTrim);
          setOriginalReply(pubTrim);
          setOriginalDm(dmTrim);
          setDraftCache((prev) => ({ ...prev, [replyOpen.id]: { pub: pubTrim, dm: dmTrim } }));
        } else {
          toast.error((data as any)?.error ?? "לא התקבל ניסוח");
        }
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message ?? "ניסוח נכשל");
      } finally {
        if (!cancelled) setDrafting(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyOpen?.id]);


  const generateDraft = async (row: EngagementRow, regenerate: boolean) => {
    if (!row.inbound_text) return;
    setDrafting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "suggest-comment-reply",
        {
          body: {
            inbound_text: row.inbound_text,
            platform: row.platform,
            sender_handle: row.sender_handle,
            user_id: userId,
            campaign_context: [
              `Campaign: ${campaign.campaign_name}`,
              campaign.message_body ? `Published post:\n${campaign.message_body}` : null,
            ].filter(Boolean).join("\n\n"),
            campaign_post_body: campaign.message_body ?? null,
            regenerate,
            cache_bust: regenerate ? `${Date.now()}-${crypto.randomUUID()}` : undefined,
          },
        },
      );
      if (error) throw error;
      const pub = (data as any)?.public_comment ?? (data as any)?.draft;
      const dm = (data as any)?.private_messenger_dm ?? "";
      if (typeof pub === "string" && pub.trim()) {
        const pubTrim = pub.trim();
        const dmTrim = typeof dm === "string" ? dm.trim() : "";
        setReplyDraft(pubTrim);
        setDmDraft(dmTrim);
        setOriginalReply(pubTrim);
        setOriginalDm(dmTrim);
        setDraftCache((prev) => ({ ...prev, [row.id]: { pub: pubTrim, dm: dmTrim } }));
      } else {
        toast.error((data as any)?.error ?? "לא התקבל ניסוח");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "ניסוח נכשל");
    } finally {
      setDrafting(false);
    }
  };

  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const regenerateInline = async (row: EngagementRow) => {
    if (!row.inbound_text) return;
    setRegeneratingId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-comment-reply", {
        body: {
          inbound_text: row.inbound_text,
          platform: row.platform,
          sender_handle: row.sender_handle,
          user_id: userId,
          campaign_context: [
            `Campaign: ${campaign.campaign_name}`,
            campaign.message_body ? `Published post:\n${campaign.message_body}` : null,
          ].filter(Boolean).join("\n\n"),
          campaign_post_body: campaign.message_body ?? null,
          regenerate: true,
          cache_bust: `${Date.now()}-${crypto.randomUUID()}`,
        },
      });
      if (error) throw error;
      const pub = (data as any)?.public_comment ?? (data as any)?.draft;
      if (typeof pub !== "string" || !pub.trim()) {
        toast.error((data as any)?.error ?? "לא התקבל ניסוח");
        return;
      }
      const next = pub.trim();
      const { error: upErr } = await supabase
        .from("engagement_events")
        .update({ ai_reply_text: next })
        .eq("id", row.id)
        .eq("user_id", userId);
      if (upErr) throw upErr;
      setRows((prev) =>
        (prev ?? []).map((r) => (r.id === row.id ? { ...r, ai_reply_text: next } : r)),
      );
      toast.success("הטקסט נוצר מחדש");
    } catch (e: any) {
      toast.error(e?.message ?? "ניסוח נכשל");
    } finally {
      setRegeneratingId(null);
    }
  };


  const sendReply = async () => {
    if (!replyOpen) return;
    if (!sendPublic && !sendDm) {
      toast.error("בחר לפחות ערוץ אחד: תגובה פומבית או הודעה פרטית");
      return;
    }
    if (sendPublic && !replyDraft.trim()) {
      toast.error("חסר טקסט לתגובה הפומבית");
      return;
    }
    if (sendDm && !dmDraft.trim()) {
      toast.error("חסר טקסט להודעה הפרטית");
      return;
    }
    setSending(true);
    try {
      const dmText = sendDm ? dmDraft.trim() : "";
      const finalPublic = sendPublic ? replyDraft.trim() : "";
      const { data, error } = await supabase.functions.invoke(
        "ayrshare-comment-reply",
        {
          body: {
            event_id: replyOpen.id,
            user_id: userId,
            comment: finalPublic || undefined,
            platform: replyOpen.platform,
            comment_id: replyOpen.external_id,
            private_dm: dmText || undefined,
            skip_public_reply: !sendPublic,
          },
        },
      );
      if (error) throw error;
      if ((data as any)?.halt === true || (data as any)?.rate_limited === true) {
        toast.error("מערכת הסנכרון בהפסקה זמנית להגנת החשבון");
        return;
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      const dmSent = Boolean((data as any)?.private_dm_sent);
      if (sendPublic && dmText && dmSent) {
        toast.success("התגובה פורסמה והודעה פרטית נשלחה בהצלחה למסנג'ר!");
      } else if (sendPublic && dmText && !dmSent) {
        toast.success("התגובה פורסמה, אך שליחת ה-DM הפרטי נכשלה — בדוק חיבור Messenger.");
      } else if (!sendPublic && dmText) {
        toast.success(dmSent ? "ההודעה הפרטית נשלחה למסנג'ר" : "שליחת ה-DM הפרטי נכשלה — בדוק חיבור Messenger.");
      } else {
        toast.success("התגובה פורסמה");
      }

      // Active-learning capture (shared helper — see src/lib/learnFromEdit.ts).
      learnFromEdit({
        context: `campaign_reply:${replyOpen.platform}`,
        pairs: [
          { label: "public_comment", original: originalReply, edited: finalPublic },
          { label: "private_messenger_dm", original: originalDm, edited: dmText },
        ],
      });

      setReplyOpen(null);
      setReplyDraft("");
      setDmDraft("");
      setOriginalReply("");
      setOriginalDm("");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "פרסום נכשל");
    } finally {
      setSending(false);
    }
  };


  // No initial loading block — comments always render in-place. The
  // background refresh keeps the list fresh without flashing a spinner.

  const renderEditor = (r: EngagementRow) => (
    <div className="w-full space-y-4 text-right">
      <div className="flex items-center gap-4 justify-end text-xs font-medium">
        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={sendPublic}
            onChange={(e) => setSendPublic(e.target.checked)}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          פרסם תגובה פומבית
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={sendDm}
            onChange={(e) => setSendDm(e.target.checked)}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          שלח הודעה פרטית
        </label>
      </div>
      <div className={cn("space-y-1.5", !sendPublic && "opacity-50")}>
        <p className="text-xs font-semibold text-muted-foreground text-right">
          תגובה פומבית
        </p>
        <Textarea
          value={drafting ? "" : replyDraft}
          onChange={(e) => setReplyDraft(e.target.value)}
          dir="auto"
          rows={5}
          placeholder={drafting ? "מנסח תגובה מקצועית..." : "הזן תגובה..."}
          disabled={drafting || !sendPublic}
          className="w-full min-h-[120px] text-right text-sm leading-relaxed"
        />
      </div>
      <div className={cn("space-y-1.5", !sendDm && "opacity-50")}>
        <p className="text-xs font-semibold text-muted-foreground text-right">
          הודעה פרטית למסנג'ר
        </p>
        <Textarea
          value={drafting ? "" : dmDraft}
          onChange={(e) => setDmDraft(e.target.value)}
          dir="auto"
          rows={7}
          placeholder={drafting ? "מנסח DM מקצועי..." : "טיוטת DM פרטי"}
          disabled={drafting || !sendDm}
          className="w-full min-h-[160px] text-right text-sm leading-relaxed bg-muted/30"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => generateDraft(r, true)}
          disabled={drafting || sending}
          aria-label="נסח מחדש"
          title="נסח מחדש"
          className="h-9 w-9 shrink-0"
        >
          <RefreshCw className={cn("h-4 w-4", drafting && "animate-spin")} />
        </Button>
        <Button
          size="sm"
          onClick={sendReply}
          disabled={
            sending ||
            (!sendPublic && !sendDm) ||
            (sendPublic && !replyDraft.trim()) ||
            (sendDm && !dmDraft.trim())
          }
          className="flex-1 h-9"
        >
          <Send className="ml-1 h-4 w-4" />
          {sending
            ? "שולח..."
            : sendPublic && sendDm
              ? "פרסם תגובה ושלח DM"
              : sendPublic
                ? "פרסם תגובה"
                : "שלח הודעה פרטית"}
        </Button>
      </div>
    </div>
  );

  const renderCommentNode = (node: CommentRow, depth = 0): React.ReactNode => {
    const replies = childrenByParent.get(node.id) ?? [];
    return (
      <div
        key={node.id}
        className={cn(
          depth === 0
            ? "border border-border p-4 rounded-xl mb-4 bg-white relative text-right"
            : "p-3 bg-slate-50 rounded-lg text-sm",
        )}
      >
        <CommentBubble
          row={node}
          onToggleEditor={(r) => setReplyOpen(replyOpen?.id === r.id ? null : r)}
          expanded={replyOpen?.id === node.id}
          editor={replyOpen?.id === node.id ? renderEditor(node) : null}
          onRegenerate={regenerateInline}
          regenerating={regeneratingId === node.id}
          isReply={depth > 0}
          embedded
        />

        {replies.length > 0 && (
          <div
            className={cn(
              "mt-4 mr-10 pr-4 border-r-2 border-slate-200 bg-slate-50 p-3 rounded-lg flex flex-col gap-3",
            )}
          >
            {replies.map((reply) => renderCommentNode(reply, depth + 1))}
          </div>
        )}
      </div>
    );
  };


  return (
    <div className="space-y-2 text-right" dir="rtl">
      {!hideHeader && (
        <div className="flex items-center justify-start">
          <p className="text-xs font-semibold text-foreground">
            תגובות לקמפיין ({rows?.length ?? 0})
          </p>
        </div>
      )}

      {fbSessionExpired && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <span aria-hidden className="mt-0.5">⚠️</span>
          <div className="space-y-1 flex-1">
            <div className="font-semibold">חיבור פייסבוק זמני פקע</div>
            <div className="text-amber-700/90 dark:text-amber-300/90">
              יש לחדש את החיבור דרך הגדרות הערוצים. תגובות שכבר נטענו מוצגות מהזיכרון המקומי.
            </div>
          </div>
        </div>
      )}

      {(!rows || rows.length === 0) && !fbSessionExpired && (
        <p className="text-xs text-muted-foreground">אין תגובות עדיין לקמפיין זה</p>
      )}

      {providerWarning && !fbSessionExpired && (
        <p className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          החיבור לפייסבוק חסום כרגע: {providerWarning}
        </p>
      )}


      <div className="space-y-4">
        {rootComments.map((parent) => renderCommentNode(parent))}
      </div>
    </div>
  );
}

function CommentBubble({
  row,
  onToggleEditor,
  expanded,
  editor,
  onRegenerate,
  regenerating,
  isReply,
  repliedToText,
  replyPreviewText,
  replyCount,
  threadExpanded,
  onToggleThread,
  embedded,
}: {
  row: EngagementRow;
  onToggleEditor: (r: EngagementRow) => void;
  expanded: boolean;
  editor?: React.ReactNode;
  onRegenerate?: (r: EngagementRow) => void;
  regenerating?: boolean;
  isReply?: boolean;
  repliedToText?: string | null;
  replyPreviewText?: string | null;
  replyCount?: number;
  threadExpanded?: boolean;
  onToggleThread?: () => void;
  embedded?: boolean;
}) {
  const dt = new Date(row.created_at);
  const when = dt.toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const senderName = row.sender_handle ?? "אנונימי";
  const meta = (row.metadata as any) ?? {};
  const senderId: string | null =
    meta?.sender_id ?? meta?.author?.id ?? meta?.from?.id ?? null;
  const avatarUrl: string | null =
    (row as any).sender_avatar_url ||
    meta?.sender_avatar_url ||
    meta?.profile_image ||
    meta?.author?.profile_image ||
    meta?.author?.picture ||
    meta?.profile_picture_url ||
    meta?.from?.picture?.data?.url ||
    null;
  const initials = senderName
    .replace(/^@/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join("") || "?";
  // Treat any Page-entity author (the workspace's own FB Page or any other Page)
  // as "self/page authored" so its name is never rendered in the tree.
  const isPageAuthored =
    meta?.self_authored === true ||
    meta?.author_type === "workspace_page" ||
    String(meta?.from?.category ?? "").toLowerCase() === "page" ||
    String(meta?.author?.category ?? "").toLowerCase() === "page" ||
    meta?.author?.is_page === true;
  const isSelfAuthored = isPageAuthored;
  const alreadyReplied = !isSelfAuthored && (row.status === "sent" || row.status === "replied");
  const toggleLabel = expanded ? "סגור" : "צור תגובת AI";
  const cleanRepliedTo = repliedToText?.trim() || null;
  const cleanReplyPreview = replyPreviewText?.trim() || null;
  return (
    <div
      className={cn(
        embedded ? "text-right" : "rounded-xl border border-border bg-background p-3 text-right",
        !embedded && isReply && "bg-slate-50 border-slate-200",
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <Avatar className="h-6 w-6 shrink-0">
            {avatarUrl && !isPageAuthored && <AvatarImage src={avatarUrl} alt={senderName} />}
            <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-semibold">{isPageAuthored ? "★" : initials}</AvatarFallback>
          </Avatar>
          <span className="truncate font-medium text-foreground">{isPageAuthored ? "התגובה שלך" : senderName}</span>
          <span
            aria-label={sentimentLabel(row.sentiment)}
            title={sentimentLabel(row.sentiment)}
            className="shrink-0 inline-flex items-center"
          >
            {row.sentiment === "positive" ? (
              <Smile className="h-4 w-4 text-emerald-500" />
            ) : row.sentiment === "negative" ? (
              <Frown className="h-4 w-4 text-red-500" />
            ) : (
              <Meh className="h-4 w-4 text-amber-500" />
            )}
          </span>
        </div>
        <span className="shrink-0">{when}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm text-foreground">
        {row.inbound_text}
      </p>
      {cleanRepliedTo && (
        <button
          type="button"
          onClick={onToggleThread}
          className="mt-2 block w-full rounded-md border border-border/70 bg-muted/35 px-2 py-1.5 text-right text-[12px] text-muted-foreground hover:bg-muted/60"
          aria-expanded={threadExpanded}
        >
          <span className="line-clamp-2">↳ {cleanRepliedTo}</span>
        </button>
      )}
      <div className="mt-2 space-y-2">
        {(replyCount ?? 0) > 0 && (
          <button
            type="button"
            onClick={onToggleThread}
            className="flex w-full items-start gap-1 text-right text-[12px] text-muted-foreground hover:text-foreground"
            aria-expanded={threadExpanded}
          >
            <Bot className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="flex-1 whitespace-pre-wrap break-words">
              {cleanReplyPreview ?? row.ai_reply_text ?? ""}
            </span>
            <span className="shrink-0 mt-0.5">({replyCount} {replyCount === 1 ? "תגובה" : "תגובות"})</span>
            {threadExpanded ? (
              <ChevronUp className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            )}
          </button>
        )}
        {alreadyReplied ? (
          (replyCount ?? 0) === 0 && (
            <div className="flex w-full items-start gap-1 text-right text-[12px] text-muted-foreground">
              <Bot className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span className="flex-1 whitespace-pre-wrap break-words">
                {cleanReplyPreview ?? row.ai_reply_text ?? row.inbound_text}
              </span>
            </div>
          )
        ) : isSelfAuthored ? null : (
          <>
            <button
              type="button"
              onClick={() => onToggleEditor(row)}
              className="inline-flex items-center gap-1 text-[14px] font-medium text-[hsl(220,70%,25%)] hover:underline"
              aria-expanded={expanded}
            >
              <Bot className="h-3.5 w-3.5" />
              {toggleLabel}
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
            {expanded && (
              <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                {editor}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}


