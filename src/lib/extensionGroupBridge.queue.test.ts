import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rows: [] as any[], query: {} as any }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: 'member' } } }) },
  from: vi.fn(() => mocks.query),
} }));
import { fetchCloudQueue } from './extensionGroupBridge';
afterEach(() => vi.clearAllMocks());
it('loads server-created and browser jobs, preserving workspace, content and persisted post links', async () => {
  for (const method of ['select', 'eq', 'in', 'neq', 'gte', 'order']) mocks.query[method] = vi.fn(() => mocks.query);
  mocks.query.limit = vi.fn(async () => ({ data: mocks.rows, error: null }));
  mocks.rows = [
    { id: 'server', activity_type: 'fb_group_post', status: 'completed', target_ref: '123', target_label: 'Group', created_at: '2026-10-05T12:00:00Z', scheduled_for: '2026-10-05T12:00:00Z', payload: { campaign_log_id: 'campaign', body: 'post body', media_urls: ['image'], fb_post_url: 'https://www.facebook.com/groups/123/posts/456' } },
    { id: 'cloud-browser', activity_type: 'fb_group_post', status: 'processing', payload: { job: { id: 'browser', text: 'browser body', workspaceOwnerId: 'wrong' } } },
    { id: 'comment', activity_type: 'fb_comment', payload: { body: 'comment only' } },
  ];
  const queue = await fetchCloudQueue('workspace-a');
  expect(mocks.query.eq).toHaveBeenCalledWith('workspace_owner_id', 'workspace-a');
  expect(queue).toHaveLength(2);
  expect(queue[0]).toMatchObject({ id: 'server', campaignLogId: 'campaign', text: 'post body', workspaceOwnerId: 'workspace-a', groupUrl: 'https://www.facebook.com/groups/123', status: 'completed', postUrl: 'https://www.facebook.com/groups/123/posts/456' });
  expect(queue[1]).toMatchObject({ id: 'browser', status: 'posting', workspaceOwnerId: 'workspace-a' });
});