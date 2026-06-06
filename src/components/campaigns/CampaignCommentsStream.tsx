// CampaignCommentsStream — live comment thread for a published campaign card.
// Strict workspace isolation: queries `engagement_events` with the active
// user_id (RLS also enforces it). Matches on external_post_id when the
// campaign log has a provider_message_id, otherwise falls back to a time-
// windowed lookup around the campaign's created_at.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Bot, MessageSquare, RefreshCw, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { campaignMatchesExternalPost, getCampaignPostIds } from "@/lib/campaignPostIds";

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
};

type Props = {
  userId: string;
  campaign: {
    id: string;
    campaign_name: string;
    channel: string;
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

export function CampaignCommentsStream({ userId, campaign }: Props) {
  const [rows, setRows] = useState<EngagementRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [replyOpen, setReplyOpen] = useState<EngagementRow | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchRows = async () => {
    let q = supabase
      .from("engagement_events")
      .select(
        "id, user_id, platform, sender_handle, inbound_text, ai_reply_text, status, sentiment, external_id, external_post_id, metadata, created_at",
      )
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("created_at", { ascending: true })
      .limit(500);

    const postIds = getCampaignPostIds(campaign);
    if (postIds.length > 0) {
      q = q.in("external_post_id", postIds);
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
    setRows((data ?? []) as EngagementRow[]);
  };

  const load = async () => {
    setLoading(true);
    try {
      await fetchRows();
    } catch (e: any) {
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
      const postIds = getCampaignPostIds(campaign);
      const pid = postIds[0] ?? null;
      await Promise.allSettled([
        supabase.functions.invoke("ayrshare-analytics", {
          body: pid ? { provider_message_id: pid } : {},
        }),
        supabase.functions.invoke("ayrshare-sync-comments", {
          body: pid ? { provider_message_id: pid, post_ids: postIds } : {},
        }),
      ]);
      await fetchRows();
      toast.success("הנתונים עודכנו");
    } catch (e: any) {
      toast.error(e?.message ?? "רענון נכשל");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id, campaign.provider_message_id]);

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
            if (payload.eventType === "DELETE" || (payload.new as any)?.is_archived) {
              return current.filter((row) => row.id !== changed.id);
            }
            const nextRow = payload.new as EngagementRow;
            const exists = current.some((row) => row.id === nextRow.id);
            const next = exists
              ? current.map((row) => (row.id === nextRow.id ? nextRow : row))
              : [...current, nextRow];
            return next.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, campaign.id, campaign.provider_message_id, campaign.provider_response, campaign.channel]);

  // Build a shallow tree by metadata.parent_id (set by ayrshare-comments-fetch).
  const tree = useMemo(() => {
    const all = rows ?? [];
    const byExt = new Map<string, EngagementRow>();
    all.forEach((r) => r.external_id && byExt.set(r.external_id, r));
    const roots: Array<EngagementRow & { children: EngagementRow[] }> = [];
    const childMap = new Map<string, EngagementRow[]>();
    all.forEach((r) => {
      const parent = (r.metadata as any)?.parent_id as string | undefined;
      if (parent && byExt.has(parent)) {
        const arr = childMap.get(parent) ?? [];
        arr.push(r);
        childMap.set(parent, arr);
      } else {
        roots.push({ ...r, children: [] });
      }
    });
    roots.forEach((r) => {
      r.children = r.external_id ? childMap.get(r.external_id) ?? [] : [];
    });
    return roots;
  }, [rows]);

  const openReply = async (row: EngagementRow) => {
    setReplyOpen(row);
    setReplyDraft(row.ai_reply_text ?? "");
    if (!row.ai_reply_text) {
      await generateDraft(row, false);
    }
  };

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
            campaign_context: `Campaign: ${campaign.campaign_name}`,
            regenerate,
          },
        },
      );
      if (error) throw error;
      const draft = (data as any)?.draft;
      if (typeof draft === "string" && draft.trim()) {
        setReplyDraft(draft.trim());
      } else {
        toast.error((data as any)?.error ?? "לא התקבל ניסוח");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "ניסוח נכשל");
    } finally {
      setDrafting(false);
    }
  };

  const sendReply = async () => {
    if (!replyOpen || !replyDraft.trim()) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "ayrshare-comment-reply",
        {
          body: {
            event_id: replyOpen.id,
            user_id: userId,
            comment: replyDraft.trim(),
            platform: replyOpen.platform,
          },
        },
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("התגובה פורסמה");
      setReplyOpen(null);
      setReplyDraft("");
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
        {tree.map((root) => (
          <li key={root.id}>
            <CommentBubble row={root} onReply={openReply} />
            {root.children.length > 0 && (
              <ul className="mt-2 space-y-2 border-r-2 border-border/60 pr-3 mr-2">
                {root.children.map((child) => (
                  <li key={child.id}>
                    <CommentBubble row={child} onReply={openReply} isReply />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={!!replyOpen} onOpenChange={(o) => !o && setReplyOpen(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-right">תגובת AI</DialogTitle>
            <DialogDescription className="text-right">
              ערוך את הניסוח לפני פרסום בערוץ {replyOpen?.platform}.
            </DialogDescription>
          </DialogHeader>
          {replyOpen && (
            <div className="space-y-3 text-right">
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <div className="mb-1 flex items-center justify-end gap-2 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-medium",
                      sentimentClass(replyOpen.sentiment),
                    )}
                  >
                    {sentimentLabel(replyOpen.sentiment)}
                  </span>
                  <span className="font-medium text-foreground">
                    {replyOpen.sender_handle ?? "אנונימי"}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-foreground">
                  {replyOpen.inbound_text}
                </p>
              </div>

              <Textarea
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                dir="auto"
                rows={5}
                placeholder={drafting ? "מנסח..." : "הזן תגובה..."}
                className="text-right"
              />
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => replyOpen && generateDraft(replyOpen, true)}
              disabled={drafting || sending}
            >
              <Sparkles className="ml-1 h-4 w-4" />
              נסח מחדש
            </Button>
            <Button
              size="sm"
              onClick={sendReply}
              disabled={sending || !replyDraft.trim()}
            >
              <Send className="ml-1 h-4 w-4" />
              {sending ? "מפרסם..." : "פרסם תגובה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CommentBubble({
  row,
  onReply,
  isReply,
}: {
  row: EngagementRow;
  onReply: (r: EngagementRow) => void;
  isReply?: boolean;
}) {
  const dt = new Date(row.created_at);
  const when = dt.toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-background p-3 text-right",
        isReply && "bg-muted/30",
      )}
    >
      <div className="mb-1 flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
        <span>{when}</span>
        <span>·</span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium",
            sentimentClass(row.sentiment),
          )}
        >
          {sentimentLabel(row.sentiment)}
        </span>
        <span className="font-medium text-foreground">
          {row.sender_handle ?? "אנונימי"}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-sm text-foreground">
        {row.inbound_text}
      </p>
      {row.ai_reply_text && (
        <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-sm">
          <div className="mb-1 flex items-center justify-end gap-1 text-[10px] text-primary">
            <span className="font-semibold">תגובת AI</span>
            <Bot className="h-3 w-3" />
          </div>
          <p className="whitespace-pre-wrap text-foreground">{row.ai_reply_text}</p>
          <div className="mt-1 text-[10px] text-muted-foreground">
            סטטוס: {row.status}
          </div>
        </div>
      )}
      <div className="mt-2 flex justify-start">
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={() => onReply(row)}
        >
          <MessageSquare className="ml-1 h-3.5 w-3.5" />
          {row.ai_reply_text ? "ערוך והגב" : "צור תגובת AI"}
        </Button>
      </div>
    </div>
  );
}
