import { describe, expect, it, vi } from 'vitest';
import { requestExtensionPagePosts } from './extensionPostBridge';
describe('acknowledged extension delivery', () => {
  it('ignores foreign results and acknowledges only the matching workspace/Page array', async () => {
    const spy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    const pending = requestExtensionPagePosts({ scrape: true, workspaceOwnerId: 'udi', pageId: 'page-u', timeoutMs: 1000 });
    const request = spy.mock.calls[0][0];
    const emit = (workspaceOwnerId: string) => window.dispatchEvent(new MessageEvent('message', {
      source: window, origin: window.location.origin,
      data: { source: 'realtyz-extension', type: 'RZ_FB_PAGE_SCRAPE_RESULT', requestId: request.requestId,
        workspaceOwnerId, pageId: 'page-u', ok: true, posts: [{ post_id: '12345', message: 'post' }] },
    }));
    emit('other');
    expect(spy).toHaveBeenCalledTimes(1);
    emit('udi');
    expect(await pending).toHaveLength(1);
    expect(spy.mock.calls[1][0]).toMatchObject({ type: 'RZ_FB_PAGE_SCRAPE_ACK', workspaceOwnerId: 'udi', requestId: request.requestId });
    spy.mockRestore();
  });
});