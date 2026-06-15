import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ChevronDown, ChevronUp, Users, Check, Timer, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

type QueuedRow = {
  id: string;
  target_label: string | null;
  status: string;
  publication_status: 'pending_time_bank' | 'ready_awaiting_whatsapp_auth' | 'published' | null;
  scheduled_for: string;
  completed_at: string | null;
  payload: any;
};

function normalize(s: string): string {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function fmtTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('he-IL', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}

/**
 * Read-only mirror of CustomGroupsQuickShare for a published campaign.
 * Scopes manual_share queue rows to this campaign by matching the first
 * meaningful chunk of the body text within a ±2-day window of the campaign.
 * Renders nothing if no group activity is found for this post.
 */
export function CampaignGroupBreakdown({
  workspaceOwnerId,
  campaignBody,
  campaignCreatedAt,
}: {
  workspaceOwnerId: string | null;
  campaignBody: string | null;
  campaignCreatedAt: string | null;
}) {
  const [rows, setRows] = useState<QueuedRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  const matchKey = useMemo(() => {
    const n = normalize(campaignBody ?? '');
    // First ~60 chars of the unique listing text — long enough to discriminate
    // between simultaneous campaigns, short enough to survive AI spinning.
    return n.slice(0, 60);
  }, [campaignBody]);

  useEffect(() => {
    if (!workspaceOwnerId || !matchKey || matchKey.length < 12) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const createdAt = campaignCreatedAt ? new Date(campaignCreatedAt).getTime() : Date.now();
      const since = new Date(createdAt - 2 * 24 * 3600 * 1000).toISOString();
      const until = new Date(createdAt + 2 * 24 * 3600 * 1000).toISOString();
      const { data } = await (supabase as any)
        .from('campaign_activity_queue')
        .select('id, target_label, status, publication_status, scheduled_for, completed_at, payload')
        .eq('workspace_owner_id', workspaceOwnerId)
        .eq('activity_type', 'manual_share')
        .gte('created_at', since)
        .lte('created_at', until)
        .order('scheduled_for', { ascending: true });
      if (cancelled) return;
      const list = (data ?? []) as QueuedRow[];
      // Body-overlap filter (client-side — JSONB ILIKE can't span keys cleanly).
      const filtered = list.filter((r) => {
        const t = normalize(
          [r.payload?.outbound_text, r.payload?.body].filter(Boolean).join(' '),
        );
        return t.includes(matchKey);
      });
      setRows(filtered);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [workspaceOwnerId, matchKey, campaignCreatedAt]);

  if (!loaded) return null;
  if (rows.length === 0) return null;

  return (
    <div
      className="mx-4 mb-4 rounded-xl border-2 border-dashed border-amber-400/60 bg-amber-50/40 dark:bg-amber-950/10"
      dir="rtl"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2"
      >
        <span className="flex items-center gap-1.5 text-sm font-bold text-foreground">
          <Users className="h-4 w-4 text-amber-700 dark:text-amber-400" />
          פרסום בקבוצות פייסבוק
        </span>
        <span className="mr-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300" dir="ltr">
          {rows.length}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open ? (
        <div className="divide-y divide-border/60 overflow-hidden rounded-b-lg border-t border-border/60 bg-background">
          {rows.map((r) => {
            const isPublished = r.status === 'completed' || r.publication_status === 'published';
            const isReady = r.status === 'ready';
            const isPending = r.status === 'pending';
            const countdownMs = isPending ? Math.max(0, new Date(r.scheduled_for).getTime() - Date.now()) : 0;
            const mins = Math.floor(countdownMs / 60000);
            return (
              <div key={r.id}>
                <div className="flex items-center gap-2 px-3 pt-2">
                  {isPublished ? (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : isReady ? (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600/70 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Lock className="h-3 w-3" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground text-right">
                    {r.target_label ?? '—'}
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 pb-2 pt-1">
                  {isPublished ? (
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                      <Check className="h-3 w-3" />
                      פורסם
                    </span>
                  ) : isReady ? (
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-600/15 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                      ממתין לאישור
                    </span>
                  ) : isPending ? (
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300" dir="ltr">
                      <Timer className="h-3 w-3" />
                      {mins}m
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                      {r.status}
                    </span>
                  )}
                  <span className="flex-1" />
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground" dir="ltr">
                    {fmtTime(r.completed_at ?? r.scheduled_for)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default CampaignGroupBreakdown;
