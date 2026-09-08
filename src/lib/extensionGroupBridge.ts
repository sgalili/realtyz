import { ensureMandatoryComment } from "@/lib/mandatoryComment";
/**
 * extensionGroupBridge — connects the companion Realtyz browser extension to
 * the app's Facebook group selection + publishing state.
 *
 * Transport (all three are supported, any one is enough):
 *  1. window.postMessage({ source: 'realtyz-extension', type: 'RZ_FB_GROUPS', groups: [...] })
 *  2. localStorage key `rz-ext-fb-groups` (extension writes, app reacts to `storage`)
 *  3. document CustomEvent `rz:ext-fb-groups` with `detail.groups`
 *
 * Publishing back to the extension:
 *  window.postMessage({ source: 'realtyz-app', type: 'RZ_FB_GROUP_PUBLISH', payload })
 *  + CustomEvent `rz:ext-fb-publish` so a content script can pick it up.
 */

import { useEffect, useState } from "react";

export const EXT_GROUPS_STORAGE_KEY = "rz-ext-fb-groups";
export const EXT_GROUPS_MESSAGE = "RZ_FB_GROUPS";
/** Message type emitted by the companion browser extension. */
export const EXT_SYNC_GROUPS_MESSAGE = "REALTYZ_SYNC_GROUPS";
export const EXT_GROUPS_EVENT = "rz:ext-fb-groups";
export const EXT_PUBLISH_MESSAGE = "RZ_FB_GROUP_PUBLISH";
export const EXT_PUBLISH_EVENT = "rz:ext-fb-publish";
export const EXT_REQUEST_MESSAGE = "RZ_FB_GROUPS_REQUEST";

export type ExtensionGroup = {
  group_id: string;
  group_name: string;
  group_icon: string | null;
  group_url: string | null;
  member_count: number | null;
};

const parseMemberCount = (raw: any): number | null => {
  const value = raw?.member_count ?? raw?.memberCount ?? raw?.members ?? raw?.members_count;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const text = String(value ?? '').trim().toLowerCase().replace(/,/g, '');
  const match = text.match(/([\d.]+)\s*([km]?)/i);
  if (!match) return null;
  const factor = match[2] === 'm' ? 1_000_000 : match[2] === 'k' ? 1_000 : 1;
  const count = Number(match[1]) * factor;
  return Number.isFinite(count) ? Math.max(0, Math.round(count)) : null;
};

const normalizeOne = (raw: any): ExtensionGroup | null => {
  if (!raw) return null;
  const url: string | null = raw.group_url ?? raw.url ?? raw.href ?? null;
  const idMatch = typeof url === "string" ? url.match(/facebook\.com\/groups\/([A-Za-z0-9._-]+)/i) : null;
  const rawId = raw.group_id ?? raw.id ?? raw.gid ?? (idMatch ? idMatch[1] : null);
  if (!rawId) return null;
  const id = String(rawId);
  return {
    group_id: id.startsWith("ext:") ? id : `ext:${id}`,
    group_name: String(raw.group_name ?? raw.name ?? raw.title ?? id),
    group_icon: raw.group_icon ?? raw.icon ?? raw.image ?? null,
    group_url: url ?? `https://www.facebook.com/groups/${id.replace(/^ext:/, "")}`,
    member_count: parseMemberCount(raw),
  };
};

export const normalizeExtensionGroups = (input: any): ExtensionGroup[] => {
  const arr = Array.isArray(input) ? input : Array.isArray(input?.groups) ? input.groups : [];
  const seen = new Set<string>();
  return arr
    .map(normalizeOne)
    .filter((g): g is ExtensionGroup => !!g)
    .filter((g) => (seen.has(g.group_id) ? false : (seen.add(g.group_id), true)));
};

export const readExtensionGroups = (): ExtensionGroup[] => {
  try {
    const raw = localStorage.getItem(EXT_GROUPS_STORAGE_KEY);
    return raw ? normalizeExtensionGroups(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
};

export const writeExtensionGroups = (groups: ExtensionGroup[]) => {
  try {
    localStorage.setItem(EXT_GROUPS_STORAGE_KEY, JSON.stringify(groups));
  } catch {
    /* noop */
  }
};

/** Ask the extension to (re)pull groups from the live Facebook session. */
export const requestExtensionGroups = () => {
  try {
    window.postMessage({ source: "realtyz-app", type: EXT_REQUEST_MESSAGE }, window.location.origin);
  } catch { /* noop */ }
  try {
    document.dispatchEvent(new CustomEvent(`${EXT_GROUPS_EVENT}:request`));
  } catch { /* noop */ }
};

/** Live extension-synced groups. Updates instantly on push. */
export const useExtensionGroups = () => {
  const [groups, setGroups] = useState<ExtensionGroup[]>(() => readExtensionGroups());
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  useEffect(() => {
    const commit = (input: any) => {
      const next = normalizeExtensionGroups(input);
      if (next.length === 0) return;
      setGroups(next);
      setLastSyncAt(Date.now());
      writeExtensionGroups(next);
    };

    const onMessage = (e: MessageEvent) => {
      const d: any = e.data;
      if (!d || typeof d !== "object") return;
      if (d.type !== EXT_GROUPS_MESSAGE && d.type !== EXT_SYNC_GROUPS_MESSAGE) return;
      commit(d.groups ?? d.payload ?? d.data);
    };
    const onCustom = (e: Event) => commit((e as CustomEvent).detail);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== EXT_GROUPS_STORAGE_KEY) return;
      try { commit(e.newValue ? JSON.parse(e.newValue) : []); } catch { /* noop */ }
    };

    window.addEventListener("message", onMessage);
    document.addEventListener(EXT_GROUPS_EVENT, onCustom as EventListener);
    window.addEventListener(EXT_GROUPS_EVENT, onCustom as EventListener);
    window.addEventListener("storage", onStorage);
    requestExtensionGroups();

    // Same-tab writes by the extension do not raise a `storage` event, so we
    // also poll the key and commit whenever its content changed.
    let lastRaw = (() => { try { return localStorage.getItem(EXT_GROUPS_STORAGE_KEY); } catch { return null; } })();
    const poll = window.setInterval(() => {
      let raw: string | null = null;
      try { raw = localStorage.getItem(EXT_GROUPS_STORAGE_KEY); } catch { return; }
      if (raw === lastRaw) return;
      lastRaw = raw;
      try { commit(raw ? JSON.parse(raw) : []); } catch { /* noop */ }
    }, 2000);

    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener(EXT_GROUPS_EVENT, onCustom as EventListener);
      window.removeEventListener(EXT_GROUPS_EVENT, onCustom as EventListener);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(poll);
    };
  }, []);

  return { groups, lastSyncAt, refresh: requestExtensionGroups };
};

export type ExtensionPublishPayload = {
  text: string;
  firstComment?: string | null;
  imageUrls?: string[];
  link?: string | null;
  scheduledAt?: string | null;
  groups: { group_id: string; group_url: string | null; group_name: string }[];
};

/**
 * Hand a broadcast job to the extension / automation worker.
 * Returns the number of target groups that were dispatched.
 */
export const publishViaExtension = (payload: ExtensionPublishPayload): number => {
  const known = readExtensionGroups();
  const resolved = payload.groups
    .map((g) => {
      const hit = known.find((k) => k.group_id === g.group_id);
      const bare = g.group_id.replace(/^ext:/, "");
      return {
        group_id: g.group_id,
        group_name: g.group_name || hit?.group_name || bare,
        group_url: g.group_url || hit?.group_url || `https://www.facebook.com/groups/${bare}`,
      };
    })
    .filter((g) => !!g.group_url);
  if (resolved.length === 0) return 0;

  const job = {
    source: "realtyz-app",
    type: EXT_PUBLISH_MESSAGE,
    // HARD RULE: the mandatory contact comment ships with every group post.
    payload: { ...payload, firstComment: ensureMandatoryComment(payload.firstComment), groups: resolved, jobId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
  };
  try { window.postMessage(job, window.location.origin); } catch { /* noop */ }
  try { document.dispatchEvent(new CustomEvent(EXT_PUBLISH_EVENT, { detail: job.payload })); } catch { /* noop */ }
  // Local hand-off: the extension posts straight from this browser, no Meta API.
  startLocalPosting({ ...payload, groups: resolved });
  return resolved.length;
};

export const EXT_PENDING_POST_KEY = "rz-pending-post";
export const EXT_START_POSTING_MESSAGE = "RZ_START_POSTING";
export const EXT_POSTING_RESULT_MESSAGE = "RZ_POSTING_RESULT";

/** Shared local queue the browser extension drains (no Meta Graph API). */
export const EXT_POST_QUEUE_KEY = "rzPostQueue";
export const EXT_QUEUE_EVENT = "rz:update-queue";
export const EXT_QUEUE_MESSAGE = "RZ_QUEUE_UPDATE";

export type QueuedExtensionPost = {
  id: string;
  type?: "group_post" | "page_first_comment";
  text?: string;
  /** Group post target (legacy field). */
  groupUrl?: string;
  groupName?: string;
  /** Page first-comment target. */
  postId?: string;
  postUrl?: string;
  firstComment?: string | null;
  images?: string[];
  link?: string | null;
  status: "pending" | "posting" | "completed" | "failed";
  scheduledTime: number;
  createdAt: number;
};


export const readPostQueue = (): QueuedExtensionPost[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(EXT_POST_QUEUE_KEY) || "[]");
    return Array.isArray(raw) ? (raw as QueuedExtensionPost[]) : [];
  } catch {
    return [];
  }
};

export const writePostQueue = (queue: QueuedExtensionPost[]) => {
  try { localStorage.setItem(EXT_POST_QUEUE_KEY, JSON.stringify(queue)); } catch { /* noop */ }
  try { document.dispatchEvent(new CustomEvent(EXT_QUEUE_EVENT, { detail: queue })); } catch { /* noop */ }
  try {
    window.postMessage({ source: "realtyz-app", type: EXT_QUEUE_MESSAGE, queue }, window.location.origin);
  } catch { /* noop */ }
};

/**
 * Queue one post per target group for the extension's browser automation.
 * Returns the number of queued entries.
 */
export const enqueueExtensionPosts = (input: {
  text: string;
  /** Optional per-group phrasing ({ [group_id]: text }) to avoid duplicate-content filtering. */
  texts?: Record<string, string>;
  groups: { group_id: string; group_name?: string; group_url?: string | null }[];
  images?: string[];
  link?: string | null;
  firstComment?: string | null;
  /** ISO string or ms timestamp; omit for immediate posting. */
  scheduledAt?: string | number | null;
}): number => {
  const when = input.scheduledAt ? new Date(input.scheduledAt).getTime() : Date.now();
  const scheduledTime = Number.isFinite(when) ? when : Date.now();
  const entries: QueuedExtensionPost[] = input.groups
    .map<QueuedExtensionPost | null>((g) => {
      const bare = String(g.group_id || "").replace(/^ext:/, "");
      const url = g.group_url || (bare ? `https://www.facebook.com/groups/${bare}` : "");
      if (!url) return null;
      const override = input.texts?.[g.group_id] ?? input.texts?.[bare];
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: override && override.trim() ? override : input.text,
        groupUrl: url,
        groupName: g.group_name || bare,
        images: input.images ?? [],
        link: input.link ?? null,
        firstComment: ensureMandatoryComment(input.firstComment),
        status: "pending" as const,
        scheduledTime,
        createdAt: Date.now(),
      };
    })
    .filter((e): e is QueuedExtensionPost => !!e);
  if (entries.length === 0) return 0;

  const existingQueue = readPostQueue();
  existingQueue.push(...entries);
  writePostQueue(existingQueue);
  return entries.length;
};

/**
 * Queue a first-comment job for a published Facebook Page post.
 * Used when Meta's Graph API blocks server-side comments (App Review/PPAC)
 * and the Realtyz browser extension should post the comment from the user's
 * own Facebook session instead.
 */
export const enqueuePageFirstComment = (input: {
  postId: string;
  postUrl: string;
  firstComment: string;
  scheduledAt?: string | number | null;
}): boolean => {
  const text = String(input.firstComment || "").trim();
  const postId = String(input.postId || "").trim();
  const postUrl = String(input.postUrl || "").trim();
  if (!text || !postId || !postUrl) return false;
  const when = input.scheduledAt ? new Date(input.scheduledAt).getTime() : Date.now();
  const scheduledTime = Number.isFinite(when) ? when : Date.now();
  const entry: QueuedExtensionPost = {
    id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: "page_first_comment",
    postId,
    postUrl,
    firstComment: ensureMandatoryComment(text),
    status: "pending",
    scheduledTime,
    createdAt: Date.now(),
  };
  const existingQueue = readPostQueue();
  existingQueue.push(entry);
  writePostQueue(existingQueue);
  return true;
};

/** Legacy Meta Graph / App Review errors that no longer apply to group posts. */

export const isLegacyMetaGroupError = (reason?: string | null): boolean => {
  const t = String(reason || '');
  if (!t) return false;
  return /App Review|Permissions and Features|Meta Developer Console|אין הרשאה לפרסם בקבוצה|publish_to_groups|#200|OAuth/i.test(t);
};

/**
 * Live view of the local extension post queue (localStorage['rzPostQueue']).
 * Updates on same-tab writes, cross-tab storage events and extension messages.
 */
export const useExtensionQueue = (): QueuedExtensionPost[] => {
  const [queue, setQueue] = useState<QueuedExtensionPost[]>(() => readPostQueue());

  useEffect(() => {
    const commit = (next: unknown) => {
      if (Array.isArray(next)) setQueue(next as QueuedExtensionPost[]);
      else setQueue(readPostQueue());
    };
    const onCustom = (e: Event) => commit((e as CustomEvent).detail);
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key !== EXT_POST_QUEUE_KEY) return;
      commit(undefined);
    };
    const onMessage = (e: MessageEvent) => {
      const d: any = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type !== EXT_QUEUE_MESSAGE) return;
      commit(d.queue);
    };

    document.addEventListener(EXT_QUEUE_EVENT, onCustom as EventListener);
    window.addEventListener('storage', onStorage);
    window.addEventListener('message', onMessage);
    // The extension writes the queue from its own context — poll as a safety net.
    let lastRaw = (() => { try { return localStorage.getItem(EXT_POST_QUEUE_KEY); } catch { return null; } })();
    const poll = window.setInterval(() => {
      let raw: string | null = null;
      try { raw = localStorage.getItem(EXT_POST_QUEUE_KEY); } catch { raw = null; }
      if (raw !== lastRaw) { lastRaw = raw; commit(undefined); }
    }, 4000);

    return () => {
      document.removeEventListener(EXT_QUEUE_EVENT, onCustom as EventListener);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('message', onMessage);
      window.clearInterval(poll);
    };
  }, []);

  return queue;
};

/** Drop failed/completed queue entries for a post before it is retried. */
export const resetQueueEntriesForText = (text: string) => {
  const key = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!key) return;
  const next = readPostQueue().filter(
    (e) => !(String(e.text || '').replace(/\s+/g, ' ').includes(key) && e.status !== 'posting'),
  );
  writePostQueue(next);
};

export const EXT_QUEUE_REMOVE_MESSAGE = "RZ_QUEUE_REMOVE";

const queueTextKey = (t: unknown) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 40);

/**
 * Drop queue entries for posts the user deleted in the app, so the extension
 * stops trying to publish them. Removes from localStorage['rzPostQueue'] and
 * asks the extension to purge the same jobs from chrome.storage.local.
 */
export const removeQueueEntriesForPosts = (input: {
  ids?: string[];
  texts?: (string | null | undefined)[];
}): number => {
  const ids = new Set((input.ids || []).map((i) => String(i)).filter(Boolean));
  const keys = (input.texts || []).map(queueTextKey).filter(Boolean);
  if (ids.size === 0 && keys.length === 0) return 0;

  const matches = (e: QueuedExtensionPost) => {
    if (ids.has(String(e.id))) return true;
    const body = queueTextKey(e.text) || queueTextKey(e.firstComment);
    if (!body) return false;
    return keys.some((k) => body.includes(k) || k.includes(body));
  };

  const current = readPostQueue();
  const next = current.filter((e) => !matches(e));
  const removed = current.length - next.length;
  if (removed > 0) writePostQueue(next);

  // Tell the extension to purge them from its own storage (the background
  // merge is additive, so a local removal alone is not enough).
  try {
    window.postMessage(
      {
        source: 'realtyz-app',
        type: EXT_QUEUE_REMOVE_MESSAGE,
        ids: Array.from(ids),
        textKeys: keys,
      },
      window.location.origin,
    );
  } catch { /* noop */ }

  return removed;
};

/** Aggregate extension queue status for a post body. */
export const queueStatusForText = (
  queue: QueuedExtensionPost[],
  text: string,
): 'pending' | 'posting' | 'completed' | 'failed' | null => {
  const key = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!key) return null;
  const hits = queue.filter((e) => String(e.text || '').replace(/\s+/g, ' ').includes(key));
  if (hits.length === 0) return null;
  if (hits.some((e) => e.status === 'posting')) return 'posting';
  if (hits.some((e) => e.status === 'pending')) return 'pending';
  if (hits.some((e) => e.status === 'completed')) return 'completed';
  return 'failed';
};




export type LocalPostingResult = {
  ok: boolean;
  posted?: number;
  total?: number;
  failures?: string[];
  reason?: string;
};

/**
 * Hand a post to the extension for immediate local publishing (no Meta API).
 * The payload is stored in localStorage and announced via postMessage.
 */
export const startLocalPosting = (payload: ExtensionPublishPayload): number => {
  const groups = payload.groups.filter((g) => !!(g.group_url || g.group_id));
  if (groups.length === 0) return 0;

  const post = {
    text: payload.text,
    images: payload.imageUrls ?? [],
    firstComment: ensureMandatoryComment(payload.firstComment),
    link: payload.link ?? null,
    groups: groups.map((g) => ({
      group_id: g.group_id.replace(/^ext:/, ""),
      group_name: g.group_name,
      group_url: g.group_url || `https://www.facebook.com/groups/${g.group_id.replace(/^ext:/, "")}`,
    })),
    createdAt: Date.now(),
  };

  try { localStorage.setItem(EXT_PENDING_POST_KEY, JSON.stringify(post)); } catch { /* noop */ }
  try {
    window.postMessage({ source: "realtyz-app", type: EXT_START_POSTING_MESSAGE, post }, window.location.origin);
  } catch { /* noop */ }
  try { document.dispatchEvent(new CustomEvent("rz:ext-start-posting", { detail: post })); } catch { /* noop */ }
  return post.groups.length;
};

/** Listen for the extension's local posting result. Returns an unsubscribe fn. */
export const onLocalPostingResult = (cb: (r: LocalPostingResult) => void): (() => void) => {
  const onMessage = (e: MessageEvent) => {
    const d: any = e.data;
    if (!d || typeof d !== "object") return;
    if (d.source !== "realtyz-extension" || d.type !== EXT_POSTING_RESULT_MESSAGE) return;
    cb((d.result || {}) as LocalPostingResult);
  };
  const onCustom = (e: Event) => cb(((e as CustomEvent).detail || {}) as LocalPostingResult);
  window.addEventListener("message", onMessage);
  document.addEventListener("rz:ext-posting-result", onCustom as EventListener);
  return () => {
    window.removeEventListener("message", onMessage);
    document.removeEventListener("rz:ext-posting-result", onCustom as EventListener);
  };
};

export const clearExtensionGroups = () => {
  try { localStorage.removeItem(EXT_GROUPS_STORAGE_KEY); } catch { /* noop */ }
};

export const isExtensionGroupId = (id: string) => id.startsWith("ext:");

