/**
 * Single source of truth for the Facebook groups selected for campaign posting.
 *
 * Both the campaign create page (bulk bar bubble) and the scheduling dialog
 * read/write this store, so the counts can never diverge. Storage is namespaced
 * per workspace owner and changes are broadcast in-tab via a custom event.
 */

const EVENT = 'rz:campaign-groups-changed';

export const campaignGroupsKey = (owner?: string | null) =>
  owner ? `campaign:selectedGroups:${owner}` : 'campaign:selectedGroups';

export function loadCampaignGroups(owner?: string | null): string[] {
  try {
    const raw =
      localStorage.getItem(campaignGroupsKey(owner)) ||
      localStorage.getItem('campaign:bulkGroupIds') ||
      localStorage.getItem('campaign:groupIds');
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveCampaignGroups(owner: string | null | undefined, ids: string[]): void {
  try {
    localStorage.setItem(campaignGroupsKey(owner), JSON.stringify(ids));
    localStorage.setItem('campaign:groupIds', JSON.stringify(ids));
  } catch { /* storage unavailable */ }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: ids }));
  } catch { /* SSR / no window */ }
}

/** Subscribe to selection changes made anywhere in the app. */
export function subscribeCampaignGroups(cb: (ids: string[]) => void): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (Array.isArray(detail)) cb(detail.filter((x): x is string => typeof x === 'string'));
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
