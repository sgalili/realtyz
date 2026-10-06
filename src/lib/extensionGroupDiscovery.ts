/**
 * extensionGroupDiscovery — asks the companion browser extension to search
 * Facebook groups by keyword and to join selected groups, all inside the
 * broker's own logged-in browser. Nothing here touches the Graph API.
 *
 * App -> extension:  { source: 'realtyz-app', type: 'RZ_FB_GROUP_SEARCH', requestId, query }
 *                    { source: 'realtyz-app', type: 'RZ_FB_GROUP_JOIN', requestId, groups }
 * Extension -> app:  { source: 'realtyz-extension', type: 'RZ_FB_GROUP_SEARCH_RESULT', requestId, ok, groups, error }
 *                    { source: 'realtyz-extension', type: 'RZ_FB_GROUP_JOIN_PROGRESS', requestId, groupId, status, done, error }
 */

export type DiscoveredGroup = {
  group_id: string;
  group_name: string;
  group_url: string;
  group_icon: string | null;
  member_count: number | null;
  /** Posts per day/week normalised to posts per day; null when unknown. */
  posts_per_day: number | null;
  privacy: string | null;
  is_member: boolean;
  activity_text: string | null;
};

export type JoinStatus = "joining" | "joined" | "requested" | "already_member" | "needs_answers" | "failed";

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Popularity score: members dominate, activity breaks ties and lifts busy groups. */
export const groupScore = (g: DiscoveredGroup) =>
  Math.log10((g.member_count ?? 0) + 1) * 10 + Math.log10((g.posts_per_day ?? 0) + 1) * 6;

export const sortDiscovered = (rows: DiscoveredGroup[], by: "popularity" | "members" | "activity") =>
  [...rows].sort((a, b) => {
    if (by === "members") return (b.member_count ?? -1) - (a.member_count ?? -1) || a.group_id.localeCompare(b.group_id);
    if (by === "activity") return (b.posts_per_day ?? -1) - (a.posts_per_day ?? -1) || a.group_id.localeCompare(b.group_id);
    return groupScore(b) - groupScore(a) || a.group_id.localeCompare(b.group_id);
  });

export function searchGroupsViaExtension(query: string, timeoutMs = 90_000): Promise<DiscoveredGroup[]> {
  const requestId = newId();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => { cleanup(); reject(new Error("timeout")); }, timeoutMs);
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.source !== "realtyz-extension" || d.type !== "RZ_FB_GROUP_SEARCH_RESULT" || d.requestId !== requestId) return;
      cleanup();
      if (!d.ok) reject(new Error(String(d.error || "search_failed")));
      else resolve(Array.isArray(d.groups) ? d.groups : []);
    };
    const cleanup = () => { window.clearTimeout(timer); window.removeEventListener("message", onMsg); };
    window.addEventListener("message", onMsg);
    window.postMessage({ source: "realtyz-app", type: "RZ_FB_GROUP_SEARCH", requestId, query }, window.location.origin);
  });
}

export function joinGroupsViaExtension(
  groups: Pick<DiscoveredGroup, "group_id" | "group_url" | "group_name">[],
  onProgress: (groupId: string, status: JoinStatus, error?: string) => void,
): { requestId: string; done: Promise<void>; cancel: () => void } {
  const requestId = newId();
  let cleanup = () => {};
  const done = new Promise<void>((resolve) => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (e.source !== window || e.origin !== window.location.origin || !d || d.source !== "realtyz-extension" || d.type !== "RZ_FB_GROUP_JOIN_PROGRESS" || d.requestId !== requestId) return;
      if (d.groupId) onProgress(String(d.groupId), d.status as JoinStatus, d.error);
      if (d.done) { cleanup(); resolve(); }
    };
    cleanup = () => window.removeEventListener("message", onMsg);
    window.addEventListener("message", onMsg);
  });
  window.postMessage({ source: "realtyz-app", type: "RZ_FB_GROUP_JOIN", requestId, groups }, window.location.origin);
  return {
    requestId,
    done,
    cancel: () => window.postMessage({ source: "realtyz-app", type: "RZ_FB_GROUP_JOIN_CANCEL", requestId }, window.location.origin),
  };
}
