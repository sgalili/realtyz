import { fbGroupUrl } from '@/lib/fbGroupUrl';

export const FIRST_COMMENT_WARNING = 'הקמפיין פורסם אך התגובה הראשונה לא נוספה';

export function isCommentOnlyFailure(error: unknown): boolean {
  return /first[_\s-]?comment|תגובה\s*(?:ה)?ראשונה/i.test(String(error || ''));
}

type CardRow = {
  id: string;
  created_at: string;
  campaign_name: string;
  channel: string;
  series_id?: string | null;
  status?: string | null;
  sent_at?: string | null;
  group_ids?: string[];
};

export function stableCardCompare(a: Pick<CardRow, 'created_at' | 'id'>, b: Pick<CardRow, 'created_at' | 'id'>): number {
  return (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0) || a.id.localeCompare(b.id);
}

export function collapseCampaignCards<T extends CardRow>(rows: T[]): Array<T & { _seriesSlots?: T[] }> {
  const groups = new Map<string, T[]>();
  for (const row of [...new Map(rows.map((r) => [r.id, r])).values()].sort(stableCardCompare)) {
    const queued = ['scheduled', 'pending', 'queued'].includes(String(row.status || '').toLowerCase());
    // An explicit series identity includes all slots, even after publication.
    // Legacy name matching is limited to queued rows to avoid merging unrelated native posts.
    const key = row.series_id ? `series:${row.series_id}:${row.channel}`
      : queued ? `legacy:${row.campaign_name}:${row.channel}` : `post:${row.id}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups.values()].map((slots) => {
    const sorted = [...slots].sort((a, b) => -stableCardCompare(a, b));
    const master = sorted[0];
    return sorted.length > 1 ? {
      ...master,
      group_ids: [...new Set(sorted.flatMap((r) => r.group_ids || []))],
      _seriesSlots: sorted,
    } : master;
  }).sort(stableCardCompare);
}

export function groupPostDestination(result: { post_url?: string; post_id?: string; postId?: string } | undefined, group: string): string | null {
  const url = result?.post_url;
  if (url && /^https?:\/\/(?:[\w-]+\.)?(?:facebook\.com|fb\.com)\//i.test(url)) return url;
  const groupUrl = fbGroupUrl(group);
  const postId = result?.post_id || result?.postId;
  return groupUrl && postId ? `${groupUrl}/posts/${encodeURIComponent(postId.split('_').pop() || postId)}` : groupUrl;
}