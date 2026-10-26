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

  it('surfaces the server error when no Facebook session exists', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { error: 'no_cloud_session', message: 'אין חיבור פייסבוק פעיל – חברו את פייסבוק תחילה' } });
    await expect(fetchGroupsViaCloud('דירות')).rejects.toThrow('אין חיבור פייסבוק פעיל');
  });

  it('syncs existing memberships rather than searching an empty query', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { job_id: 'sync-1' } })
      .mockResolvedValueOnce({ data: { job: { status: 'completed', groups: [group] } } });
    expect(await fetchGroupsViaCloud('', { syncMemberships: true, pollMs: 1 })).toEqual([group]);
    expect(mocks.invoke.mock.calls[0][1].body).toEqual({ action: 'sync_groups' });
  });

  it('never starts work for a cancelled workspace request', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(fetchGroupsViaCloud('', { syncMemberships: true, signal: controller.signal })).rejects.toThrow();
    expect(mocks.invoke).not.toHaveBeenCalled();
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
  it('bounds the initial request even when the API never responds', async () => {
    mocks.invoke.mockImplementation(() => new Promise(() => {}));
    await expect(fetchGroupsViaCloud('דירות', { timeoutMs: 20 })).rejects.toThrow('ארכה יותר מדי');
    expect(mocks.invoke.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('bounds a hung status request and surfaces structured API failures', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { job_id: 'job-1' } }).mockImplementation(() => new Promise(() => {}));
    await expect(fetchGroupsViaCloud('דירות', { timeoutMs: 20, pollMs: 1 })).rejects.toThrow('ארכה יותר מדי');
    mocks.invoke.mockResolvedValueOnce({ error: { message: 'non-2xx', context: new Response(JSON.stringify({ message: 'פייסבוק דורש אימות מחדש' })) } });
    await expect(fetchGroupsViaCloud('דירות')).rejects.toThrow('פייסבוק דורש אימות מחדש');
  });
});
