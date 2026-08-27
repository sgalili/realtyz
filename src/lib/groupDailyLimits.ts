/**
 * Per-group daily posting limits.
 *
 * Every Facebook group can carry a `max_posts_per_day` cap
 * (`fb_user_groups.max_posts_per_day`). The authoritative counter lives in
 * `fb_group_post_log` and is claimed server-side by `fb-group-publish` through
 * the `claim_fb_group_post_slot()` RPC, so a group that reached its limit is
 * blocked until the next day even if something slips past the UI.
 *
 * These helpers keep the scheduling dialogs in sync with the same rule: groups
 * that already burned their daily quota are dropped from the target list, and
 * per-day scheduling never queues more posts to a group than its cap allows.
 */
import { supabase } from '@/integrations/supabase/client';

export type GroupLimitState = {
  /** group_id -> configured daily cap (0 / undefined = unlimited) */
  limits: Record<string, number>;
  /** group_id -> posts already sent today */
  usedToday: Record<string, number>;
};

const todayIsrael = (): string => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts; // YYYY-MM-DD
};

export async function loadGroupLimitState(groupIds: string[]): Promise<GroupLimitState> {
  const state: GroupLimitState = { limits: {}, usedToday: {} };
  const ids = Array.from(new Set(groupIds.filter(Boolean)));
  if (ids.length === 0) return state;

  try {
    const { data } = await (supabase as any)
      .from('fb_user_groups')
      .select('group_id, max_posts_per_day')
      .in('group_id', ids);
    for (const r of (data ?? []) as any[]) {
      const cap = Number(r?.max_posts_per_day);
      if (Number.isFinite(cap) && cap > 0) state.limits[String(r.group_id)] = cap;
    }
  } catch { /* no limits configured */ }

  try {
    const { data } = await (supabase as any)
      .from('fb_group_post_log')
      .select('group_id, post_count')
      .eq('posted_on', todayIsrael())
      .in('group_id', ids);
    for (const r of (data ?? []) as any[]) {
      state.usedToday[String(r.group_id)] = Number(r?.post_count) || 0;
    }
  } catch { /* counters unavailable */ }

  return state;
}

/** Persist one daily cap for every selected group (0 / empty clears the cap). */
export async function saveGroupDailyLimit(groupIds: string[], limit: number | null): Promise<void> {
  const ids = Array.from(new Set(groupIds.filter(Boolean)));
  if (ids.length === 0) return;
  const value = limit && limit > 0 ? Math.min(50, Math.floor(limit)) : null;
  try {
    await (supabase as any)
      .from('fb_user_groups')
      .update({ max_posts_per_day: value })
      .in('group_id', ids);
  } catch { /* best effort — the server-side claim is authoritative */ }
}

/**
 * Drop groups that already reached today's cap. `plannedToday` counts posts this
 * scheduling run already assigned to each group for the same day.
 */
export function allowedGroupsForDay(
  groupIds: string[],
  state: GroupLimitState,
  plannedToday: Record<string, number> = {},
  isToday = true,
): { allowed: string[]; blocked: string[] } {
  const allowed: string[] = [];
  const blocked: string[] = [];
  for (const id of groupIds) {
    const cap = state.limits[id];
    if (!cap) { allowed.push(id); continue; }
    const used = (isToday ? state.usedToday[id] ?? 0 : 0) + (plannedToday[id] ?? 0);
    if (used >= cap) blocked.push(id);
    else allowed.push(id);
  }
  return { allowed, blocked };
}
