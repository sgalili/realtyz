import { supabase } from '@/integrations/supabase/client';
import { requestExtensionPagePosts } from '@/lib/extensionPostBridge';

export type ExtensionPageSyncResult = {
  status: 'synced' | 'no_extension' | 'empty' | 'error';
  scraped: number;
  upserted: number;
  error?: string;
};

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
  const posts = await requestExtensionPagePosts({
    pageId: opts.pageId ?? null,
    since: opts.since,
    scrape: true,
    max: opts.max ?? 60,
    timeoutMs: 90_000,
  });
  if (posts.length === 0) {
    const installed = typeof document !== 'undefined' &&
      (document.documentElement.dataset.realtyzExtension === '1' ||
        document.documentElement.hasAttribute('data-realtyz-extension'));
    return { status: installed ? 'empty' : 'no_extension', scraped: 0, upserted: 0 };
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
