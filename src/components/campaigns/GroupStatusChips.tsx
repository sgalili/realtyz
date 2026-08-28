// Group target chips with per-group publishing status.
// Used by the campaign history dialog (published / future / drafts tabs) so the
// broker always sees the real Facebook group names plus whether the post was
// actually accepted by each group.
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { FbGroupMeta } from '@/hooks/useFbGroupMeta';

export type GroupResult = {
  group_id?: string;
  ok?: boolean;
  code?: string | number;
  reason?: string;
  post_id?: string;
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

export function GroupStatusChips({
  groupIds,
  meta,
  results,
  defaultState = 'pending',
  max = 30,
  emptyLabel,
}: {
  groupIds: string[];
  meta: Record<string, FbGroupMeta>;
  /** Per-group publish outcome, when the post already went out. */
  results?: Record<string, GroupResult>;
  /** State used when no result exists for the group (future posts / drafts). */
  defaultState?: GroupChipState;
  max?: number;
  emptyLabel?: string;
}) {
  const ids = Array.from(new Set(groupIds.filter(Boolean).map((g) => String(g))));
  if (ids.length === 0) {
    return emptyLabel ? <p className="mt-1 text-[11px] text-muted-foreground">{emptyLabel}</p> : null;
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {ids.slice(0, max).map((gid) => {
        const bare = gid.replace(/^(ext:|manual:)/, '');
        const info = meta[gid] || meta[bare];
        const name = info?.name || `קבוצה ${bare.slice(-6)}`;
        const res = results?.[gid] ?? results?.[bare];
        const state: GroupChipState = res
          ? (res.ok ? 'published' : 'failed')
          : defaultState;
        const title = res?.reason ? `${name} — ${res.reason}` : `${name} — ${STATE_LABEL[state]}`;
        return (
          <span
            key={gid}
            title={title}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATE_STYLE[state]}`}
          >
            {info?.icon
              ? <img src={info.icon} alt="" className="h-4 w-4 rounded-full object-cover" loading="lazy" />
              : <span className="flex h-4 w-4 items-center justify-center rounded-full bg-foreground/10 text-[9px] font-bold">{name.slice(0, 1)}</span>}
            <span className="max-w-[170px] truncate">{name}</span>
            <StateIcon state={state} />
          </span>
        );
      })}
      {ids.length > max && <span className="text-[11px] text-muted-foreground">+{ids.length - max}</span>}
    </div>
  );
}
