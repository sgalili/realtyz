// Unframed group names with static per-target status; overflow stays portaled.
import { useState, type ReactNode } from 'react';
import { Ban, CheckCircle2, ChevronDown, Clock, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { groupPostDestination, isCommentOnlyFailure } from '@/lib/campaignCardHandling';
import { useFbGroupMeta, groupKeyFrom, localQueueGroupNames, type FbGroupMeta } from '@/hooks/useFbGroupMeta';
import { fbGroupUrlFrom } from '@/lib/fbGroupUrl';
import { openExternal } from '@/lib/openExternal';
import { shortenName } from '@/lib/shortenName';

export type GroupResult = {
  group_id?: string;
  ok?: boolean;
  state?: GroupChipState;
  status?: string;
  code?: string | number;
  reason?: string;
  post_id?: string;
  post_url?: string;
};

export type GroupChipState = 'published' | 'pending' | 'failed' | 'restricted';

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
  published: 'text-primary',
  pending: 'text-muted-foreground',
  failed: 'text-destructive',
  restricted: 'text-destructive',
};

const STATE_LABEL: Record<GroupChipState, string> = {
  published: 'פורסם',
  pending: 'ממתין לאישור',
  failed: 'נדחה',
  restricted: 'מוגבל לפרסום',
};

const StateIcon = ({ state }: { state: GroupChipState }) => {
  if (state === 'restricted') return <Ban className="h-3.5 w-3.5" />;
  if (state === 'published') return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (state === 'failed') return <XCircle className="h-3.5 w-3.5" />;
  return <Clock className="h-3.5 w-3.5" />;
}

export function GroupStatusChips({
  groupIds,
  meta,
  results,
  defaultState = 'pending',
  max = 30,
  emptyLabel,
  countdownIso: _countdownIso,
  defaultOpen = false,
  inline = false,
  collapsedCounter = false,
  showStatus = !collapsedCounter,
  expanded,
  onExpandedChange,
  detailsId,
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
  /** Kept for API compatibility; the collapsed pill no longer shows a countdown. */
  countdownIso?: string | null;
  defaultOpen?: boolean;
  /** Render without top margin so the collapsed pill can sit inside a flex row. */
  inline?: boolean;
  /** Campaign header: one name, otherwise a count opening portaled details. */
  collapsedCounter?: boolean;
  /** Individual subposts retain their own status even in compact header mode. */
  showStatus?: boolean;
  expanded?: boolean;
  onExpandedChange?: (open: boolean) => void;
  detailsId?: string;
  /** Rendered directly under the expanded group list (e.g. series post cards). */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const detailsOpen = expanded ?? open;
  const toggleDetails = () => {
    if (onExpandedChange) onExpandedChange(!detailsOpen);
    else setOpen(!detailsOpen);
  };
  const shared = useFbGroupMeta();
  const local = localQueueGroupNames();
  const lookup = (gid: string): FbGroupMeta | undefined => {
    const bare = gid.replace(/^(ext:|manual:)/, '');
    const key = groupKeyFrom(gid);
    const clean = (m?: FbGroupMeta) => (m && m.name && !/^\d+$/.test(m.name) && !/^https?:/i.test(m.name) ? m : undefined);
    return clean(meta?.[gid]) ?? clean(meta?.[bare]) ?? clean(meta?.[key]) ?? clean(shared[gid]) ?? clean(shared[bare]) ?? clean(shared[key]) ?? local[gid] ?? local[key];
  };
  const nameOf = (gid: string) => lookup(gid)?.name || 'קבוצת פייסבוק';

  const ids = Array.from(new Map(groupIds.filter(Boolean).map((g) => [groupKeyFrom(String(g)), String(g)])).values());
  if (ids.length === 0) {
    return emptyLabel ? <p className="mt-1 text-[11px] text-muted-foreground">{emptyLabel}</p> : null;
  }

  const stateOf = (gid: string): GroupChipState => {
    const result = results?.[gid] ?? results?.[groupKeyFrom(gid)];
    if (!result) return defaultState;
    if (isCommentOnlyFailure(result.reason)) return 'published';
    if (['restricted', 'blocked'].includes(String(result.state || result.status || '').toLowerCase()) ||
      /restricted|restriction|blocked|suspended|מוגבל|חסום|הגבל/i.test(result.reason || '')) return 'restricted';
    if (result.state) return result.state;
    const status = String(result.status || '').toLowerCase();
    if (['sent', 'published', 'completed', 'success', 'posted', 'delivered'].includes(status)) return 'published';
    if (['scheduled', 'pending', 'queued', 'publishing', 'processing', 'posting'].includes(status)) return 'pending';
    if (result.ok === true) return 'published';
    if (result.ok === false || status === 'failed' || status === 'rejected') return 'failed';
    return result.post_id || result.post_url ? 'published' : defaultState;
  };

  const renderGroup = (gid: string, showStatus = true) => {
    const info = lookup(gid);
    const result = results?.[gid] ?? results?.[groupKeyFrom(gid)];
    const state = stateOf(gid);
    const name = nameOf(gid);
    const url = groupPostDestination(result, fbGroupUrlFrom(info?.url, groupKeyFrom(gid)));
    return (
      <Button key={gid} type="button" variant="ghost" size="sm"
        title={`${name} — ${result?.reason || STATE_LABEL[state]}`}
        onClick={(e) => { e.stopPropagation(); openExternal(url); }}
        aria-label={name}
        className="h-7 min-w-0 max-w-full justify-start gap-2 overflow-hidden whitespace-nowrap rounded-none border-0 bg-transparent px-0 py-0.5 text-[11px] hover:bg-transparent">
        {showStatus && <span className={`shrink-0 ${STATE_STYLE[state]}`} aria-label={STATE_LABEL[state]}><StateIcon state={state} /></span>}
        <span className="min-w-0 truncate text-right text-foreground">{shortenName(name)}</span>
      </Button>
    );
  };

  const hasDetails = (ids.length > 1 && !!children) || ids.length > max;
  if (collapsedCounter && ids.length > 1) {
    // No aggregate status icon on the main card — status lives on each sub-post.
    return (
      <div className="min-w-0">
      <span className="inline-flex min-w-0 items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" aria-expanded={detailsOpen} aria-controls={detailsId}
              onClick={(e) => { e.stopPropagation(); toggleDetails(); }}
              className="h-7 shrink-0 gap-1 rounded-full border-border bg-background px-2 text-[11px] text-foreground">
              {ids.length} קבוצות
              <ChevronDown className={`h-3 w-3 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
            </Button>
      </span>
      {!onExpandedChange && detailsOpen && children && <div className="mt-3 w-full min-w-0 space-y-3" dir="rtl">{children}</div>}
      </div>
    );
  }
  if (collapsedCounter && ids.length === 1) {
    const gid = ids[0];
    const name = nameOf(gid);
    const state = stateOf(gid);
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" aria-label={`הצגת שם הקבוצה המלא: ${name}`}
            title={name} onClick={(e) => e.stopPropagation()}
            className="h-7 w-full min-w-0 max-w-full flex-nowrap justify-start gap-1 overflow-hidden rounded-full border-border bg-background px-2 text-[11px]">
            {showStatus && <span className={`shrink-0 ${STATE_STYLE[state]}`} aria-label={STATE_LABEL[state]}><StateIcon state={state} /></span>}
            <span className="min-w-0 flex-1 truncate text-right">{shortenName(name)}</span>
            <ChevronDown className="h-3 w-3 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" dir="rtl" className="w-[min(20rem,calc(100vw-2rem))] break-words p-3 text-sm" onClick={(e) => e.stopPropagation()}>
          {name}
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <div className={`${inline ? '' : 'mt-1.5 '}flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-0.5`} dir="rtl">
      {ids.slice(0, max).map((gid) => renderGroup(gid, showStatus))}
      {hasDetails && <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" type="button" aria-label="פרטי קבוצות ופוסטים" aria-expanded={open}
            onClick={(e) => e.stopPropagation()} className="h-7 w-7 shrink-0 border-0">
            <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" side="bottom" dir="rtl" className="w-[min(36rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto p-2" onClick={(e) => e.stopPropagation()}>
          {ids.length > max && <div className="flex min-w-0 flex-col items-stretch">{ids.slice(max).map((gid) => renderGroup(gid))}</div>}
          {children && <div className="w-full min-w-0 space-y-3">{children}</div>}
        </PopoverContent>
      </Popover>}
    </div>
  );
}
