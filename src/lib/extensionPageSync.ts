import { supabase } from '@/integrations/supabase/client';
import { requestExtensionPagePosts } from '@/lib/extensionPostBridge';

export type ExtensionPageSyncResult = {
  status: 'synced' | 'no_extension' | 'empty' | 'error' | 'timeout';
  scraped: number;
  upserted: number;
  error?: string;
};

/** Hard cap on a single extension page-scrape round trip. */
export const EXT_PAGE_SYNC_TIMEOUT_MS = 20_000;

const isExtensionInstalled = (): boolean =>
  typeof document !== 'undefined' &&
  (document.documentElement.dataset.realtyzExtension === '1' ||
    document.documentElement.hasAttribute('data-realtyz-extension'));

/**
 * Page post + engagement sync through the Realtyz browser extension. The
 * extension opens the Page in a background tab, reads posts and visible
 * counters from the DOM, and the result is saved for the active workspace.
 * No Meta Graph read permissions are involved.
 */
export async function syncPagePostsViaExtension(opts: {
  ownerId?: string | null;
  pageId?: string | null;
  since?: string;
  max?: number;
}): Promise<ExtensionPageSyncResult> {
  // Never spin when the extension bridge is not present at all.
  if (!isExtensionInstalled()) {
    return { status: 'no_extension', scraped: 0, upserted: 0 };
  }
  let timedOut = false;
  const posts = await requestExtensionPagePosts({
    pageId: opts.pageId ?? null,
    since: opts.since,
    scrape: true,
    max: opts.max ?? 60,
    timeoutMs: EXT_PAGE_SYNC_TIMEOUT_MS,
    onTimeout: () => { timedOut = true; },
  });
  if (posts.length === 0) {
    if (timedOut) return { status: 'timeout', scraped: 0, upserted: 0 };
    return { status: isExtensionInstalled() ? 'empty' : 'no_extension', scraped: 0, upserted: 0 };
  }
  const { data, error } = await supabase.functions.invoke('fb-recent-posts', {
    body: {
      posts,
      persist: true,
      user_id: opts.ownerId ?? undefined,
      owner_id: opts.ownerId ?? undefined,
      since: opts.since,
      skipAnalytics: true,
    },
  });
  if (error) return { status: 'error', scraped: posts.length, upserted: 0, error: error.message };
  const upserted = Number((data as any)?.upserted ?? (data as any)?.count ?? 0) || 0;
  return { status: 'synced', scraped: posts.length, upserted };
}
