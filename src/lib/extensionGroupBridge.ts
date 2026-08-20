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

    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener(EXT_GROUPS_EVENT, onCustom as EventListener);
      window.removeEventListener(EXT_GROUPS_EVENT, onCustom as EventListener);
      window.removeEventListener("storage", onStorage);
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
    payload: { ...payload, groups: resolved, jobId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
  };
  try { window.postMessage(job, window.location.origin); } catch { /* noop */ }
  try { document.dispatchEvent(new CustomEvent(EXT_PUBLISH_EVENT, { detail: job.payload })); } catch { /* noop */ }
  return resolved.length;
};

export const clearExtensionGroups = () => {
  try { localStorage.removeItem(EXT_GROUPS_STORAGE_KEY); } catch { /* noop */ }
};

export const isExtensionGroupId = (id: string) => id.startsWith("ext:");

