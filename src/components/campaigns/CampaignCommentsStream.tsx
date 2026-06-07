// CampaignCommentsStream — live comment thread for a published campaign card.
// Strict workspace isolation: queries `engagement_events` with the active
// user_id (RLS also enforces it). Matches on external_post_id when the
// campaign log has a provider_message_id, otherwise falls back to a time-
// windowed lookup around the campaign's created_at.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, ChevronDown, ChevronUp, MessageSquare, RefreshCw, Send, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { campaignMatchesExternalPost, getCampaignPostIds, platformForCampaignChannel } from "@/lib/campaignPostIds";

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
  if (api) return `Ayrshare ${api.status ?? ""}: ${api.payload?.message ?? api.error ?? "API rejected request"}`;
  if (mapping) return mapping.error ?? "Invalid external post id mapping";
  return null;
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
const writeCache = (campaignId: string, rows: EngagementRow[]) => {
  COMMENT_CACHE.set(campaignId, rows);
  try { sessionStorage.setItem(cacheKey(campaignId), JSON.stringify(rows)); } catch { /* quota */ }
};

export function CampaignCommentsStream({ userId, campaign }: Props) {
  const cached = readCache(campaign.id);
  const [rows, setRows] = useState<EngagementRow[] | null>(cached);
  const [loading, setLoading] = useState(false);
  const [replyOpen, setReplyOpen] = useState<EngagementRow | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [dmDraft, setDmDraft] = useState("");
  // Originals returned by the AI edge function — used to detect manual edits on publish.
  const [originalReply, setOriginalReply] = useState("");
  const [originalDm, setOriginalDm] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  // Per-row cached AI drafts so closing/re-opening the editor does NOT
  // re-invoke the AI — only an explicit refresh-per-card regenerates.
  const [draftCache, setDraftCache] = useState<Record<string, { pub: string; dm: string }>>({});
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
    const next = (data ?? []) as EngagementRow[];
    setRows(next);
    writeCache(campaign.id, next);
  };


  // On mount / when the active post id resolves, run an explicit query
  // against engagement_events. The realtime subscription only delivers NEW
  // rows — existing comments must come from this fetch.
  const load = async () => {
    setLoading(true);
    try {
      await fetchRows();
    } catch (e: any) {
      console.error("[CampaignCommentsStream] initial fetch failed", {
        campaign_id: campaign.id,
        postIds,
        error: e?.message ?? String(e),
      });
      toast.error(e?.message ?? "טעינת תגובות נכשלה");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };


  // Manual refresh: bypass the 45s polling loop and force an immediate
  // server-side pull of analytics + comments scoped to THIS card's
  // provider_message_id. The realtime subscription on campaign_logs then
  // patches the counter UI live without a browser reload.
  const forceRefresh = async () => {
    setLoading(true);
    try {
      const pid = postIds[0] ?? null;
      const settled = await Promise.allSettled([
        supabase.functions.invoke("ayrshare-analytics", {
          body: pid ? { provider_message_id: pid } : {},
        }),
        postIds.length > 0
          ? supabase.functions.invoke("ayrshare-comments-fetch", {
              body: { post_ids: postIds, platform: platformForCampaignChannel(campaign.channel) },
            })
          : supabase.functions.invoke("ayrshare-sync-comments", { body: {} }),
      ]);
      for (const result of settled) {
        if (result.status === "rejected") {
          const msg = await extractFunctionError(result.reason, "רענון תגובות נכשל");
          console.error("[CampaignCommentsStream] provider refresh rejected", result.reason);
          toast.error(msg);
          continue;
        }
        const { data, error } = result.value as any;
        if (error) {
          const msg = await extractFunctionError(error, "רענון תגובות נכשל");
          console.error("[CampaignCommentsStream] provider refresh error", { error, data });
          toast.error(msg);
          continue;
        }
        const surfacedError = firstPipelineError(data);
        if (surfacedError) {
          console.error("[CampaignCommentsStream] provider pipeline error", data);
          toast.error(surfacedError);
        }
      }
      await fetchRows();
      toast.success("הנתונים עודכנו");
    } catch (e: any) {
      toast.error(e?.message ?? "רענון נכשל");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Always pull fresh comments from the provider on mount/route entry
    // so the tree reflects the latest text instead of any cached row.
    forceRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id, postIdsKey, campaign.channel]);


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
            writeCache(campaign.id, next);
            return next;
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, campaign.id, postIdsKey, campaign.channel]);

  // Build a shallow tree by metadata.parent_id (set by ayrshare-comments-fetch).
  // Defensive: guards against self-referencing rows, missing parents, and any
  // unexpected data shape that previously froze the panel on the loader.
  const tree = useMemo<Array<EngagementRow & { children: EngagementRow[] }>>(() => {
    const all = rows ?? [];
    try {
      const byExt = new Map<string, EngagementRow>();
      all.forEach((r) => {
        if (r?.external_id) byExt.set(r.external_id, r);
      });
      const roots: Array<EngagementRow & { children: EngagementRow[] }> = [];
      const childMap = new Map<string, EngagementRow[]>();
      all.forEach((r) => {
        if (!r) return;
        let parent = (r.metadata as any)?.parent_id as string | undefined;
        // Guard: a row pointing to itself would loop forever — flatten it.
        if (parent && r.external_id && parent === r.external_id) {
          parent = undefined;
        }
        if (parent && byExt.has(parent) && parent !== r.external_id) {
          const arr = childMap.get(parent) ?? [];
          arr.push(r);
          childMap.set(parent, arr);
        } else {
          // Unknown/missing parent → render as a top-level node instead of dropping.
          roots.push({ ...r, children: [] });
        }
      });
      roots.forEach((r) => {
        r.children = r.external_id ? childMap.get(r.external_id) ?? [] : [];
      });
      return roots;
    } catch (err) {
      console.error("[CampaignCommentsStream] tree build failed, falling back to flat rows", err);
      return all.map((r) => ({ ...r, children: [] }));
    }
  }, [rows]);


  const openReply = (row: EngagementRow) => {
    // Hard flush: never carry over draft text from a previous open.
    setReplyDraft("");
    setDmDraft("");
    setOriginalReply("");
    setOriginalDm("");
    setDrafting(true);
    setReplyOpen(row);
  };

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
              regenerate: true,
              cache_bust: `${Date.now()}-${crypto.randomUUID()}`,
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
    if (!replyOpen || !replyDraft.trim()) return;
    setSending(true);
    try {
      const dmText = dmDraft.trim();
      const finalPublic = replyDraft.trim();
      const { data, error } = await supabase.functions.invoke(
        "ayrshare-comment-reply",
        {
          body: {
            event_id: replyOpen.id,
            user_id: userId,
            comment: finalPublic,
            platform: replyOpen.platform,
            comment_id: replyOpen.external_id,
            private_dm: dmText || undefined,
          },
        },
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const dmSent = Boolean((data as any)?.private_dm_sent);
      if (dmText && dmSent) {
        toast.success("התגובה פורסמה והודעה פרטית נשלחה בהצלחה למסנג'ר!");
      } else if (dmText && !dmSent) {
        toast.success("התגובה פורסמה, אך שליחת ה-DM הפרטי נכשלה — בדוק חיבור Messenger.");
      } else {
        toast.success("התגובה פורסמה");
      }

      // Active-learning capture: if the broker edited either draft before
      // publishing, send the original/edited pair to learn-from-edit so the
      // persona prompt picks up the correction on future generations.
      const pairs: Array<{ label: string; original: string; edited: string }> = [];
      if (originalReply && finalPublic && originalReply !== finalPublic) {
        pairs.push({ label: "public_comment", original: originalReply, edited: finalPublic });
      }
      if (originalDm && dmText && originalDm !== dmText) {
        pairs.push({ label: "private_messenger_dm", original: originalDm, edited: dmText });
      }
      if (pairs.length > 0) {
        void supabase.functions.invoke("learn-from-edit", {
          body: {
            context: `campaign_reply:${replyOpen.platform}`,
            pairs,
          },
        }).catch(() => { /* background, never block UI */ });
      }

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


  if (loading && rows === null) {
    return (
      <p className="px-1 text-xs text-muted-foreground">טוען תגובות חיות…</p>
    );
  }

  return (
    <div className="space-y-2 text-right">
      <div className="flex items-center justify-between">
        <Button
          size="sm"
          variant="ghost"
          onClick={forceRefresh}
          disabled={loading}
          className="h-7 px-2 text-xs"
          aria-label="רענן נתונים חיים"
        >
          <RefreshCw className={cn("ml-1 h-3.5 w-3.5", loading && "animate-spin")} />
          רענון
        </Button>
        <p className="text-xs font-semibold text-foreground">
          תגובות לקמפיין ({rows?.length ?? 0})
        </p>
      </div>

      {(!rows || rows.length === 0) && (
        <p className="text-xs text-muted-foreground">אין תגובות עדיין לקמפיין זה</p>
      )}

      <ul className="space-y-2">
        {tree.map((root) => {
          const renderEditor = (r: EngagementRow) => (
            <div className="space-y-3 text-right">
              <div className="space-y-1">
                <Textarea
                  value={drafting ? "" : replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                  dir="auto"
                  rows={4}
                  placeholder={drafting ? "מנסח תגובה מקצועית..." : "הזן תגובה..."}
                  disabled={drafting}
                  className="text-right"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => {
                      if (dmDraft.trim()) {
                        navigator.clipboard.writeText(dmDraft.trim());
                        toast.success("ה-DM הועתק ללוח");
                      }
                    }}
                    disabled={!dmDraft.trim() || drafting}
                  >
                    העתק DM
                  </Button>
                  <p className="text-[11px] font-medium text-muted-foreground">
                    הודעה פרטית למסנג'ר (פרטי הנכס + חלופה + שאלה אחת)
                  </p>
                </div>
                <Textarea
                  value={drafting ? "" : dmDraft}
                  onChange={(e) => setDmDraft(e.target.value)}
                  dir="auto"
                  rows={6}
                  placeholder={drafting ? "מנסח DM מקצועי..." : "טיוטת DM פרטי"}
                  disabled={drafting}
                  className="text-right bg-muted/30"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => generateDraft(r, true)}
                  disabled={drafting || sending}
                  aria-label="נסח מחדש"
                  title="נסח מחדש"
                >
                  <RefreshCw className={cn("h-4 w-4", drafting && "animate-spin")} />
                </Button>
                <Button
                  size="sm"
                  onClick={sendReply}
                  disabled={sending || !replyDraft.trim()}
                >
                  <Send className="ml-1 h-4 w-4" />
                  {sending ? "מפרסם..." : "פרסם תגובה"}
                </Button>
              </div>
            </div>
          );
          return (
            <li key={root.id}>
              <CommentBubble
                row={root}
                onToggleEditor={(r) => setReplyOpen(replyOpen?.id === r.id ? null : r)}
                expanded={replyOpen?.id === root.id}
                editor={replyOpen?.id === root.id ? renderEditor(root) : null}
                onRegenerate={regenerateInline}
                regenerating={regeneratingId === root.id}
              />
              {root.children.length > 0 && (
                <ul className="mt-2 space-y-2 border-r-2 border-border/60 pr-3 mr-2">
                  {root.children.map((child) => (
                    <li key={child.id}>
                      <CommentBubble
                        row={child}
                        onToggleEditor={(r) => setReplyOpen(replyOpen?.id === r.id ? null : r)}
                        expanded={replyOpen?.id === child.id}
                        editor={replyOpen?.id === child.id ? renderEditor(child) : null}
                        onRegenerate={regenerateInline}
                        regenerating={regeneratingId === child.id}
                        isReply
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
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
}: {
  row: EngagementRow;
  onToggleEditor: (r: EngagementRow) => void;
  expanded: boolean;
  editor?: React.ReactNode;
  onRegenerate?: (r: EngagementRow) => void;
  regenerating?: boolean;
  isReply?: boolean;
}) {
  const dt = new Date(row.created_at);
  const when = dt.toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const senderName = row.sender_handle ?? "אנונימי";
  const avatarUrl =
    (row.metadata as any)?.author?.profile_image ||
    (row.metadata as any)?.author?.picture ||
    (row.metadata as any)?.profile_image ||
    null;
  const initials = senderName
    .replace(/^@/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join("") || "?";
  const alreadyReplied = row.status === "sent" || row.status === "replied";
  const toggleLabel = expanded ? "סגור" : "צור תגובת AI";
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-background p-3 text-right",
        isReply && "bg-muted/30",
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span
          aria-label={sentimentLabel(row.sentiment)}
          title={sentimentLabel(row.sentiment)}
          className="text-base leading-none"
        >
          {row.sentiment === "positive"
            ? "😊"
            : row.sentiment === "negative"
            ? "☹️"
            : "😐"}
        </span>
        <div className="flex flex-1 items-center justify-center gap-2 min-w-0">
          <Avatar className="h-6 w-6 shrink-0">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={senderName} />}
            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
          </Avatar>
          <span className="truncate font-medium text-foreground">{senderName}</span>
        </div>
        <span className="shrink-0">{when}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm text-foreground">
        {row.inbound_text}
      </p>
      <div className="mt-2">
        {alreadyReplied ? (
          <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
            <Bot className="h-3.5 w-3.5" />
            הגבת לתגובה זו
          </span>
        ) : (
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

