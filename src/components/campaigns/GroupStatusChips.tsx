// Group target chips with per-group publishing status.
// Collapsed by default: a single summary row with the total group count and the
// countdown to the next publishing round (dd/hh/mm/ss). Expanding reveals the
// real Facebook group names, their member counts and whether each group
// actually accepted the post.
import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { groupPostDestination, isCommentOnlyFailure } from '@/lib/campaignCardHandling';
import { useFbGroupMeta, groupKeyFrom, localQueueGroupNames, type FbGroupMeta } from '@/hooks/useFbGroupMeta';
import { fbGroupUrlFrom } from '@/lib/fbGroupUrl';
import { openExternal } from '@/lib/openExternal';

export type GroupResult = {
  group_id?: string;
  ok?: boolean;
  code?: string | number;
  reason?: string;
  post_id?: string;
  post_url?: string;
};

export type GroupChipState = 'published' | 'pending' | 'failed';

/** Normalises the group_results array stored on campaign_logs.provider_response. */
export function groupResultMap(raw: unknown): Record<string, GroupResult> {
  const map: Record<string, GroupResult> = {};
  if (!Array.isArray(raw)) return map;
  raw.forEach((r: any) => {
    const gid = String(r?.group_id ?? '');
    if (!gid) return;
    map[gid] = r as GroupResult;
    map[gid.replace(/^ext:/, '')] = r as GroupResult;
  });
  return map;
}

const STATE_STYLE: Record<GroupChipState, string> = {
  published: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  pending: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  failed: 'border-destructive/40 bg-destructive/10 text-destructive',
};

const STATE_LABEL: Record<GroupChipState, string> = {
  published: 'פורסם',
  pending: 'ממתין לאישור',
  failed: 'נדחה',
};

const StateIcon = ({ state }: { state: GroupChipState }) => {
  if (state === 'published') return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (state === 'failed') return <XCircle className="h-3.5 w-3.5" />;
  return <Clock className="h-3.5 w-3.5" />;
};

/** dd/hh/mm/ss remaining until the next publishing round. */
function useCountdown(iso?: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [iso]);
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return null;
  const s = Math.max(0, Math.floor((target - now) / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 86400))}/${pad(Math.floor((s % 86400) / 3600))}/${pad(Math.floor((s % 3600) / 60))}/${pad(s % 60)}`;
}

export function GroupStatusChips({
  groupIds,
  meta,
  results,
  defaultState = 'pending',
  max = 30,
  emptyLabel,
  countdownIso,
  defaultOpen = false,
  inline = false,
  children,
}: {
  groupIds: string[];
  meta?: Record<string, FbGroupMeta>;
  /** Per-group publish outcome, when the post already went out. */
  results?: Record<string, GroupResult>;
  /** State used when no result exists for the group (future posts / drafts). */
  defaultState?: GroupChipState;
  max?: number;
  emptyLabel?: string;
  /** When provided, the collapsed summary shows a dd/hh/mm/ss countdown. */
  countdownIso?: string | null;
  defaultOpen?: boolean;
  /** Render without top margin so the collapsed pill can sit inside a flex row. */
  inline?: boolean;
  /** Rendered directly under the expanded group list (e.g. series post cards). */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const shared = useFbGroupMeta();
  const countdown = useCountdown(countdownIso);
  const lookup = (gid: string): FbGroupMeta | undefined => {
    const bare = gid.replace(/^(ext:|manual:)/, '');
    const key = groupKeyFrom(gid);
    const local = localQueueGroupNames();
    const clean = (m?: FbGroupMeta) => (m && m.name && !/^\d+$/.test(m.name) && !/^https?:/i.test(m.name) ? m : undefined);
    return clean(meta?.[gid]) ?? clean(meta?.[bare]) ?? clean(meta?.[key]) ?? clean(shared[gid]) ?? clean(shared[bare]) ?? clean(shared[key]) ?? local[gid] ?? local[key];
  };
  const nameOf = (gid: string) => lookup(gid)?.name || 'קבוצת פייסבוק';

  const ids = Array.from(new Set(groupIds.filter(Boolean).map((g) => String(g))));
  if (ids.length === 0) {
    return emptyLabel ? <p className="mt-1 text-[11px] text-muted-foreground">{emptyLabel}</p> : null;
  }

  return (
    <div className={inline ? (open ? 'w-full basis-full min-w-0' : 'inline-block') : 'mt-1.5'} dir="rtl">
      <Button
        variant="ghost"
        size="sm"
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-expanded={open}
        className="h-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-semibold text-foreground hover:bg-muted"
      >
        <span className="max-w-[180px] truncate">{ids.length > 1 ? `${ids.length} קבוצות` : nameOf(ids[0])}</span>
        {countdown && (
          <span className="tabular-nums text-muted-foreground" dir="ltr">· {countdown}</span>
        )}
      </Button>

      {open && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {ids.slice(0, max).map((gid) => {
            const bare = groupKeyFrom(gid);
            const info = lookup(gid);
            const name = nameOf(gid);
            const res = results?.[gid] ?? results?.[bare];
            const state: GroupChipState = res ? (res.ok || isCommentOnlyFailure(res.reason) ? 'published' : 'failed') : defaultState;
            const url = groupPostDestination(res, fbGroupUrlFrom(info?.url, /^https?:/i.test(gid) ? gid : bare) || bare);
            const title = res?.reason ? `${name} — ${res.reason}` : `${name} — ${STATE_LABEL[state]}`;
            return (
              <button
                key={gid}
                type="button"
                title={url ? `${title} — פתח בפייסבוק` : title}
                onClick={(e) => {
                  e.stopPropagation();
                  openExternal(url);
                }}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATE_STYLE[state]} ${url ? 'cursor-pointer hover:brightness-95' : 'cursor-default'}`}
              >
                <span className="max-w-[170px] truncate">{name}</span>
                {typeof info?.memberCount === 'number' && info.memberCount > 0 && (
                  <span className="tabular-nums opacity-80" dir="ltr">
                    {info.memberCount.toLocaleString('he-IL')}
                  </span>
                )}
                <StateIcon state={state} />
              </button>
            );
          })}
          {ids.length > max && <span className="text-[11px] text-muted-foreground">+{ids.length - max}</span>}
        </div>
      )}
      {open && children && <div className="mt-3 w-full min-w-0 space-y-3">{children}</div>}
    </div>
  );
}
