import { supabase } from '@/integrations/supabase/client';
import { requestExtensionPagePosts } from '@/lib/extensionPostBridge';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { isExtensionInstalled } from '@/lib/extensionDetect';

export type ExtensionPageSyncResult = {
  status: 'synced' | 'no_extension' | 'empty' | 'error' | 'timeout';
  scraped: number;
  upserted: number;
  error?: string;
};

/** Hard cap on a single extension page-scrape round trip. */
export const EXT_PAGE_SYNC_TIMEOUT_MS = 45_000;


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
  if (!opts.ownerId || !opts.pageId) {
    return { status: 'error', scraped: 0, upserted: 0, error: 'workspace_page_required' };
  }
  // Never spin when the extension bridge is not present at all.
  if (!isExtensionInstalled()) {
    return { status: 'no_extension', scraped: 0, upserted: 0 };
  }
  let timedOut = false;
  let scrapeError: string | null = null;
  const posts = await requestExtensionPagePosts({
    workspaceOwnerId: opts.ownerId,
    pageId: opts.pageId ?? null,
    since: opts.since,
    scrape: true,
    max: opts.max ?? 10,
    timeoutMs: EXT_PAGE_SYNC_TIMEOUT_MS,
    // Extension stops scrolling early so its answer always lands before our timeout.
    budgetMs: EXT_PAGE_SYNC_TIMEOUT_MS - 6_000,
    onTimeout: () => { timedOut = true; },
    onResult: (r) => { if (!r.ok) scrapeError = r.error || 'scrape_failed'; },
  });
  if (posts.length === 0) {
    if (timedOut) return { status: 'timeout', scraped: 0, upserted: 0 };
    if (scrapeError) return { status: 'error', scraped: 0, upserted: 0, error: scrapeError };
    return { status: isExtensionInstalled() ? 'empty' : 'no_extension', scraped: 0, upserted: 0 };
  }
  const { data, error } = await supabase.functions.invoke('fb-recent-posts', {
    body: {
      posts,
      persist: true,
      workspace_owner_id: opts.ownerId,
      page_id: opts.pageId,
      since: opts.since,
      skipAnalytics: true,
    },
  });
  if (error) return { status: 'error', scraped: posts.length, upserted: 0,
    error: error instanceof FunctionsHttpError ? await error.context.text() : error.message };
  if (data?.ok === false || data?.workspace_owner_id !== opts.ownerId) return {
    status: 'error', scraped: posts.length, upserted: 0, error: data?.error || 'workspace_response_mismatch',
  };
  if ((data as any)?.persist_error) return { status: 'error', scraped: posts.length, upserted: 0, error: String((data as any).persist_error) };
  const upserted = Number((data as any)?.upserted ?? (data as any)?.count ?? 0) || 0;
  return { status: 'synced', scraped: posts.length, upserted };
}

/** Capture the initiating workspace once; the server owns strategy and Page identity. */
export async function syncWorkspacePagePosts(opts: {
  ownerId: string | null | undefined; since?: string; max?: number;
}): Promise<ExtensionPageSyncResult> {
  if (!opts.ownerId) return { status: 'error', scraped: 0, upserted: 0, error: 'workspace_required' };
  const ownerId = opts.ownerId;
  const { data: config, error: configError } = await supabase.functions.invoke('fb-recent-posts', {
    body: { action: 'sync_config', workspace_owner_id: ownerId },
  });
  if (configError || !config?.ok || config.workspace_owner_id !== ownerId) {
    return { status: 'error', scraped: 0, upserted: 0, error: configError?.message || config?.error || 'workspace_response_mismatch' };
  }
  if (config.sync_strategy === 'extension') {
    return syncPagePostsViaExtension({ ...opts, ownerId, pageId: config.page_id });
  }
  const { data, error } = await supabase.functions.invoke('fb-recent-posts', {
    body: { workspace_owner_id: ownerId, persist: true, since: opts.since, lastRecords: opts.max ?? 10, skipAnalytics: true },
  });
  if (error || !data?.ok || data?.workspace_owner_id !== ownerId || data?.persist_error || data?.permission_blocked || data?.sync_error) {
    return { status: 'error', scraped: 0, upserted: 0,
      error: error instanceof FunctionsHttpError ? await error.context.text() : error?.message || data?.persist_error || data?.error || data?.sync_error?.message_he || 'graph_sync_failed' };
  }
  return { status: 'synced', scraped: Number(data.count) || 0, upserted: Number(data.upserted) || 0 };
}
