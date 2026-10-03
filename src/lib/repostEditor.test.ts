import { describe, expect, it } from 'vitest';
import { matchesRepostJob, repostEditorDraft, type RepostJob } from './repostEditor';

const job: RepostJob = { id: 'queue-id', status: 'completed', scheduled_for: '2030-01-02T15:00:00Z', target_ref: 'https://www.facebook.com/groups/123/', payload: { campaign_log_id: 'post-id', job: { id: 'local-id', sourceText: 'original\n\nparagraph', firstComment: 'comment\nhttps://realtyz.co.il/r/tracked', images: ['https://realtyz.co.il/photo.jpg'], groupUrl: 'https://www.facebook.com/groups/123/' } } };
describe('repost editor', () => {
  it('matches original stable IDs regardless of delivery status', () => {
    for (const status of ['pending', 'processing', 'completed', 'failed']) {
      expect(matchesRepostJob({ ...job, status }, { id: 'post-id' })).toBe(true);
    }
    expect(matchesRepostJob(job, { id: 'another-post', message_body: 'other text', group_ids: ['123'] })).toBe(false);
  });
  it('prefills exact copy, tracked comment, photos, groups and future schedule', () => {
    const draft = repostEditorDraft({ owner: 'workspace', post: { id: 'post-id', message_body: 'edited\n\nparagraph', group_ids: ['ext:123'] }, jobs: [job] });
    expect(draft.body).toBe('edited\n\nparagraph');
    expect(draft.firstComment).toContain('https://realtyz.co.il/r/tracked');
    expect(draft.attachments).toHaveLength(1);
    expect(draft.groupIds).toEqual(['123']);
    expect(draft.mode).toBe('scheduled');
    expect(draft.scheduledLocal).not.toBe('');
  });
  it('opens an editor without legacy jobs, and converts elapsed schedules to now', () => {
    const draft = repostEditorDraft({ owner: 'workspace', post: { id: 'legacy', message_body: 'legacy text', first_comment: 'existing comment', sent_at: '2020-01-01', group_ids: ['456'] }, jobs: [] });
    expect(draft.body).toBe('legacy text');
    expect(draft.firstComment).toBe('existing comment');
    expect(draft.groupIds).toEqual(['456']);
    expect(draft.mode).toBe('now');
  });
});