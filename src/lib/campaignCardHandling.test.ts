import { describe, expect, it } from 'vitest';
import { collapseCampaignCards, groupPostDestination, isCommentOnlyFailure } from './campaignCardHandling';

describe('campaign card handling', () => {
  const slots = Array.from({ length: 10 }, (_, i) => ({
    id: `slot-${i}`, series_id: 'campaign-1', campaign_name: 'Topic', channel: 'facebook',
    created_at: `2026-10-03T10:00:${String(i).padStart(2, '0')}Z`,
    status: 'scheduled', sent_at: `2026-10-${String(i + 4).padStart(2, '0')}T10:00:00Z`,
    group_ids: [`ext:${i + 100}`],
  }));
  it('collapses all ten slots across delivery states with a stable master and order', () => {
    const other = { ...slots[0], id: 'other', series_id: 'campaign-2', created_at: '2026-10-03T12:00:00Z' };
    const before = collapseCampaignCards([...slots, other]);
    const after = collapseCampaignCards([...slots].reverse().map((r, i) => ({ ...r, status: i % 2 ? 'sent' : 'failed' })).concat(other));
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
    expect(after[1]._seriesSlots).toHaveLength(10);
    expect(after[1].group_ids).toHaveLength(10);
  });
  it('does not combine unrelated published posts by title', () => {
    expect(collapseCampaignCards(slots.map((r) => ({ ...r, series_id: null, status: 'sent' })))).toHaveLength(10);
  });
  it('prefers a real post link and falls back to the group for pending posts', () => {
    expect(groupPostDestination({ post_url: 'https://www.facebook.com/groups/123/posts/456' }, 'ext:123')).toContain('/posts/456');
    expect(groupPostDestination(undefined, 'ext:123')).toBe('https://www.facebook.com/groups/123');
    expect(groupPostDestination({ post_id: '123_456' }, '123')).toContain('/posts/456');
  });
  it('distinguishes comment warnings from actual post failures', () => {
    expect(isCommentOnlyFailure('הפוסט פורסם אך התגובה הראשונה לא נוספה')).toBe(true);
    expect(isCommentOnlyFailure('first_comment_failed')).toBe(true);
    expect(isCommentOnlyFailure('Facebook rejected the post')).toBe(false);
  });
});