import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), scrape: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('@/lib/extensionPostBridge', () => ({ requestExtensionPagePosts: mocks.scrape }));
import { syncWorkspacePagePosts } from './extensionPageSync';

describe('workspace page sync routing', () => {
  beforeEach(() => { vi.resetAllMocks(); document.documentElement.dataset.realtyzExtension = '1'; });
  it('routes Graph workspace without invoking extension', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { ok: true, workspace_owner_id: 'rita', sync_strategy: 'graph', page_id: 'page-r' } })
      .mockResolvedValueOnce({ data: { ok: true, workspace_owner_id: 'rita', count: 2, upserted: 2 } });
    expect(await syncWorkspacePagePosts({ ownerId: 'rita' })).toMatchObject({ status: 'synced', upserted: 2 });
    expect(mocks.scrape).not.toHaveBeenCalled();
    expect(mocks.invoke.mock.calls[1][1].body).toMatchObject({ workspace_owner_id: 'rita', persist: true });
  });
  it('binds extension extraction and persistence to the initiating workspace and Page', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { ok: true, workspace_owner_id: 'udi', sync_strategy: 'extension', page_id: 'page-u' } })
      .mockResolvedValueOnce({ data: { ok: true, workspace_owner_id: 'udi', upserted: 1 } });
    mocks.scrape.mockResolvedValue([{ post_id: '12345', message: 'post', media: [] }]);
    expect(await syncWorkspacePagePosts({ ownerId: 'udi' })).toMatchObject({ status: 'synced' });
    expect(mocks.scrape).toHaveBeenCalledWith(expect.objectContaining({ workspaceOwnerId: 'udi', pageId: 'page-u' }));
    expect(mocks.invoke.mock.calls[1][1].body).toMatchObject({ workspace_owner_id: 'udi', page_id: 'page-u' });
  });
  it('rejects a configuration response from another workspace', async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true, workspace_owner_id: 'other', sync_strategy: 'graph' } });
    expect(await syncWorkspacePagePosts({ ownerId: 'udi' })).toMatchObject({ status: 'error' });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
  it('rejects unbound imports before asking the extension', async () => {
    expect(await syncWorkspacePagePosts({ ownerId: null })).toMatchObject({ status: 'error' });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});