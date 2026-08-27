/**
 * extensionPostBridge — DOM fallback for Facebook Page post imports.
 *
 * When Meta's Graph API blocks the read (typically `#10 pages_read_engagement`
 * on an app that hasn't passed App Review for that permission), we ask the
 * companion Realtyz browser extension to scrape the Page's posts straight from
 * the logged-in Facebook DOM and hand them back to the app.
 *
 * Transport mirrors extensionGroupBridge:
 *   app  -> extension: postMessage({ source: 'realtyz-app', type: 'RZ_FB_POSTS_REQUEST', ... })
 *   ext  -> app:       postMessage({ source: 'realtyz-extension', type: 'RZ_FB_POSTS', posts: [...] })
 *                      or CustomEvent `rz:ext-fb-posts` with `detail.posts`.
 */

export const EXT_POSTS_REQUEST = 'RZ_FB_POSTS_REQUEST';
export const EXT_POSTS_MESSAGE = 'RZ_FB_POSTS';
export const EXT_POSTS_EVENT = 'rz:ext-fb-posts';
export const EXT_COMMENTS_REQUEST = 'RZ_FB_COMMENTS_REQUEST';
export const EXT_COMMENTS_MESSAGE = 'RZ_FB_COMMENTS';
export const EXT_COMMENTS_EVENT = 'rz:ext-fb-comments';

export type ExtensionCommentBundle = {
  post_id: string;
  comments: Array<{
    id: string;
    message: string;
    created_time: string | null;
    from: { id: string | null; name: string | null };
    permalink_url: string | null;
    parent: { id: string } | null;
  }>;
};

const normalizeCommentBundles = (input: any): ExtensionCommentBundle[] => {
  const arr = Array.isArray(input) ? input : Array.isArray(input?.comments) ? input.comments : [];
  return arr
    .map((entry: any) => {
      const postId = String(entry?.post_id ?? entry?.postId ?? '').trim();
      const list = Array.isArray(entry?.comments) ? entry.comments : [];
      if (!postId || list.length === 0) return null;
      return {
        post_id: postId,
        comments: list
          .map((c: any) => ({
            id: String(c?.id ?? '').trim(),
            message: String(c?.message ?? c?.text ?? '').trim(),
            created_time: c?.created_time ?? null,
            from: { id: c?.from?.id ?? null, name: c?.from?.name ?? null },
            permalink_url: c?.permalink_url ?? null,
            parent: c?.parent?.id ? { id: String(c.parent.id) } : null,
          }))
          .filter((c: any) => c.id && c.message),
      };
    })
    .filter((b: any): b is ExtensionCommentBundle => !!b && b.comments.length > 0);
};

/**
 * Ask the extension for the DOM-scraped comment trees of specific post IDs.
 * Resolves with an empty array when no extension answers — the caller treats
 * that as "fallback unavailable", never as an error to alert on.
 */
export const requestExtensionPostComments = (
  postIds: string[],
  timeoutMs = 12000,
): Promise<ExtensionCommentBundle[]> =>
  new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve([]);
    let done = false;
    const finish = (bundles: ExtensionCommentBundle[]) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      document.removeEventListener(EXT_COMMENTS_EVENT, onEvent as EventListener);
      window.clearTimeout(timer);
      resolve(bundles);
    };
    const onMessage = (event: MessageEvent) => {
      const data: any = event.data;
      if (!data || data.source !== 'realtyz-extension') return;
      if (data.type !== EXT_COMMENTS_MESSAGE) return;
      finish(normalizeCommentBundles(data.comments ?? data.payload));
    };
    const onEvent = (event: CustomEvent) => finish(normalizeCommentBundles(event.detail?.comments ?? event.detail));

    window.addEventListener('message', onMessage);
    document.addEventListener(EXT_COMMENTS_EVENT, onEvent as EventListener);
    const timer = window.setTimeout(() => finish([]), timeoutMs);

    const payload = { source: 'realtyz-app', type: EXT_COMMENTS_REQUEST, postIds };
    try { window.postMessage(payload, window.location.origin); } catch { /* noop */ }
    try {
      document.dispatchEvent(new CustomEvent(`${EXT_COMMENTS_EVENT}:request`, { detail: payload }));
    } catch { /* noop */ }
  });


export type ExtensionPost = {
  post_id: string;
  message: string;
  url: string | null;
  created_time: string | null;
  media: string[];
};

const normalizeOne = (raw: any): ExtensionPost | null => {
  if (!raw) return null;
  const url: string | null = raw.url ?? raw.postUrl ?? raw.permalink_url ?? null;
  const idFromUrl = typeof url === 'string' ? url.match(/(?:posts|permalink)\/(\d{5,})/)?.[1] : null;
  const id = String(raw.post_id ?? raw.postId ?? raw.fbId ?? raw.id ?? idFromUrl ?? '').trim();
  if (!id) return null;
  const mediaRaw = Array.isArray(raw.media) ? raw.media : Array.isArray(raw.images) ? raw.images : [];
  return {
    post_id: id,
    message: String(raw.message ?? raw.post ?? raw.text ?? '').trim(),
    url,
    created_time: raw.created_time ?? raw.created ?? raw.date ?? null,
    media: mediaRaw.map((m: any) => (typeof m === 'string' ? m : m?.url)).filter((u: any) => typeof u === 'string' && u),
  };
};

export const normalizeExtensionPosts = (input: any): ExtensionPost[] => {
  const arr = Array.isArray(input) ? input : Array.isArray(input?.posts) ? input.posts : [];
  const seen = new Set<string>();
  return arr
    .map(normalizeOne)
    .filter((p): p is ExtensionPost => !!p)
    .filter((p) => (seen.has(p.post_id) ? false : (seen.add(p.post_id), true)));
};

/**
 * Ask the extension for the Page's posts and resolve with whatever arrives
 * before the timeout. Resolves with an empty array when no extension answers —
 * callers treat that as "fallback unavailable", never as an error to alert on.
 */
export const requestExtensionPagePosts = (
  opts: { pageId?: string | null; since?: string; timeoutMs?: number } = {},
): Promise<ExtensionPost[]> => {
  const timeoutMs = opts.timeoutMs ?? 12000;
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve([]);
    let done = false;
    const finish = (posts: ExtensionPost[]) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      document.removeEventListener(EXT_POSTS_EVENT, onEvent as EventListener);
      window.clearTimeout(timer);
      resolve(posts);
    };

    const onMessage = (event: MessageEvent) => {
      const data: any = event.data;
      if (!data || data.source !== 'realtyz-extension') return;
      if (data.type !== EXT_POSTS_MESSAGE) return;
      finish(normalizeExtensionPosts(data.posts ?? data.payload));
    };
    const onEvent = (event: CustomEvent) => finish(normalizeExtensionPosts(event.detail?.posts ?? event.detail));

    window.addEventListener('message', onMessage);
    document.addEventListener(EXT_POSTS_EVENT, onEvent as EventListener);
    const timer = window.setTimeout(() => finish([]), timeoutMs);

    const payload = { source: 'realtyz-app', type: EXT_POSTS_REQUEST, pageId: opts.pageId ?? null, since: opts.since ?? null };
    try {
      window.postMessage(payload, window.location.origin);
    } catch {
      /* noop */
    }
    try {
      document.dispatchEvent(new CustomEvent(`${EXT_POSTS_EVENT}:request`, { detail: payload }));
    } catch {
      /* noop */
    }
  });
};
