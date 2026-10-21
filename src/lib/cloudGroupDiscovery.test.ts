import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
import { fetchGroupsViaCloud } from './cloudGroupDiscovery';

const group = { group_id: '123', group_name: 'קבוצה', group_url: 'https://www.facebook.com/groups/123' };

describe('cloud group discovery', () => {
  beforeEach(() => vi.resetAllMocks());

  it('enqueues a cloud fetch and resolves with the scanned groups', async () => {
    mocks.invoke
      .mockResolvedValueOnce({ data: { success: true, job_id: 'job-1' } })
      .mockResolvedValueOnce({ data: { success: true, job: { id: 'job-1', status: 'processing', groups: null, error: null } } })
      .mockResolvedValueOnce({ data: { success: true, job: { id: 'job-1', status: 'completed', groups: [group], error: null } } });
    const rows = await fetchGroupsViaCloud('דירות', { pollMs: 1, timeoutMs: 5000 });
    expect(rows).toEqual([group]);
    expect(mocks.invoke.mock.calls[0][1].body).toEqual({ action: 'fetch_groups', query: 'דירות' });
    expect(mocks.invoke.mock.calls[1][1].body).toEqual({ action: 'fetch_status', job_id: 'job-1' });
  });

  it('surfaces the server error when no cloud session exists', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { error: 'no_cloud_session', message: 'אין חיבור פייסבוק פעיל בענן – חברו את פייסבוק תחילה' } });
    await expect(fetchGroupsViaCloud('דירות')).rejects.toThrow('אין חיבור פייסבוק פעיל בענן');
  });

  it('throws the job error when the cloud scan fails', async () => {
    mocks.invoke
      .mockResolvedValueOnce({ data: { success: true, job_id: 'job-2' } })
      .mockResolvedValueOnce({ data: { success: true, job: { id: 'job-2', status: 'failed', groups: null, error: 'לא נמצאו קבוצות מתאימות' } } });
    await expect(fetchGroupsViaCloud('דירות', { pollMs: 1, timeoutMs: 5000 })).rejects.toThrow('לא נמצאו קבוצות מתאימות');
  });

  it('times out when the cloud scan never completes', async () => {
    mocks.invoke.mockResolvedValue({ data: { success: true, job_id: 'job-3', job: { id: 'job-3', status: 'processing', groups: null, error: null } } });
    await expect(fetchGroupsViaCloud('דירות', { pollMs: 1, timeoutMs: 20 })).rejects.toThrow('ארכה יותר מדי');
  });
});
