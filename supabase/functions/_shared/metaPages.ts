// Shared Meta Page selection logic.
//
// /me/accounts returns every asset the token can manage — including
// non-publishable "Employee"/business assets (e.g. 122096304951460522) that
// must never become the default publishing target. This module scores the
// list so the workspace's primary business Page always wins.

/** The broker's primary business Page (override with META_PRIMARY_PAGE_ID). */
export const PRIMARY_PAGE_ID =
  (Deno.env.get("META_PRIMARY_PAGE_ID") || "61580625810292").trim();

/**
 * Every Page id that belongs to the broker, best-first. The primary id is the
 * publishing identity; the rest stay preferred over any other asset so an
 * older/renamed Page still beats a business "Employee" asset.
 */
export const KNOWN_PAGE_IDS = [
  PRIMARY_PAGE_ID,
  ...(Deno.env.get("META_KNOWN_PAGE_IDS") || "61580625810292,729806313557785")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
].filter((id, i, a) => a.indexOf(id) === i);

/** Assets that are never valid publishing targets. */
const BLOCKED_PAGE_IDS = new Set(
  (Deno.env.get("META_BLOCKED_PAGE_IDS") || "122096304951460522")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

/** Name patterns that mark a business/employee asset rather than a Page. */
const BLOCKED_NAME = /employee|עובד|business\s*asset/i;

/** Name patterns of the broker's real Page (fallback when the ID changes). */
const PREFERRED_NAME = /(אנגלו\s*סכסון|anglo\s*saxon|ויטמן|witman|vitman)/i;

export type MetaAccount = {
  id?: unknown;
  name?: unknown;
  access_token?: unknown;
  tasks?: unknown;
  [k: string]: unknown;
};

export function isBlockedPage(p: MetaAccount | null | undefined): boolean {
  if (!p) return true;
  const id = String((p as any).id ?? "").trim();
  if (!id) return true;
  if (BLOCKED_PAGE_IDS.has(id)) return true;
  return BLOCKED_NAME.test(String((p as any).name ?? ""));
}

function score(p: MetaAccount): number {
  const id = String((p as any).id ?? "").trim();
  const name = String((p as any).name ?? "");
  let s = 0;
  if (id === PRIMARY_PAGE_ID) s += 1000;
  else if (KNOWN_PAGE_IDS.includes(id)) s += 500;
  if (PREFERRED_NAME.test(name)) s += 200;
  if ((p as any).access_token) s += 50;
  const tasks = Array.isArray((p as any).tasks) ? (p as any).tasks.map(String) : [];
  if (tasks.includes("CREATE_CONTENT") || tasks.includes("MANAGE")) s += 25;
  if (isBlockedPage(p)) s -= 5000;
  return s;
}

/** Ordered publishing candidates: primary Page first, blocked assets last. */
export function rankPages<T extends MetaAccount>(list: T[]): T[] {
  return list
    .filter((p) => String((p as any)?.id ?? "").trim().length > 0)
    .sort((a, b) => score(b) - score(a));
}

/**
 * Pick the Page to publish with. `wantedId` (explicit user choice) wins when it
 * exists in the list; otherwise the highest-scoring Page is chosen and blocked
 * assets are only used if literally nothing else is available.
 */
export function pickPrimaryPage<T extends MetaAccount>(
  list: T[],
  wantedId?: string | null,
): T | null {
  const ranked = rankPages(list);
  if (ranked.length === 0) return null;
  const wanted = (wantedId ?? "").trim();
  if (wanted) {
    const hit = ranked.find((p) => String((p as any).id) === wanted);
    if (hit) return hit;
  }
  return ranked.find((p) => !isBlockedPage(p)) ?? ranked[0];
}
