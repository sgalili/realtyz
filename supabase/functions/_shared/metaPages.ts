// Shared Meta Page selection logic.
//
// The broker may bind ANY Facebook Page they manage — there is no hardcoded
// "verified business page" requirement. This module only ranks the list so a
// sensible default is preselected when the user does not choose explicitly.

/** Optional preferred Page id (soft hint only, never a requirement). */
export const PRIMARY_PAGE_ID = (Deno.env.get("META_PRIMARY_PAGE_ID") || "").trim();

/** Optional soft-preferred Page ids (ranking hint only). */
export const KNOWN_PAGE_IDS = [
  PRIMARY_PAGE_ID,
  ...(Deno.env.get("META_KNOWN_PAGE_IDS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
].filter((id, i, a) => !!id && a.indexOf(id) === i);

/** Explicit opt-in blocklist (empty by default — nothing is blocked). */
const BLOCKED_PAGE_IDS = new Set(
  (Deno.env.get("META_BLOCKED_PAGE_IDS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

export type MetaAccount = {
  id?: unknown;
  name?: unknown;
  access_token?: unknown;
  tasks?: unknown;
  [k: string]: unknown;
};

/** Only a missing id (or an explicitly configured blocklist) is invalid. */
export function isBlockedPage(p: MetaAccount | null | undefined): boolean {
  if (!p) return true;
  const id = String((p as any).id ?? "").trim();
  if (!id) return true;
  return BLOCKED_PAGE_IDS.has(id);
}

function score(p: MetaAccount): number {
  const id = String((p as any).id ?? "").trim();
  let s = 0;
  if (PRIMARY_PAGE_ID && id === PRIMARY_PAGE_ID) s += 1000;
  else if (KNOWN_PAGE_IDS.includes(id)) s += 500;
  if ((p as any).access_token) s += 50;
  const tasks = Array.isArray((p as any).tasks) ? (p as any).tasks.map(String) : [];
  if (tasks.includes("CREATE_CONTENT") || tasks.includes("MANAGE")) s += 25;
  if (isBlockedPage(p)) s -= 5000;
  return s;
}

/** Ordered publishing candidates. */
export function rankPages<T extends MetaAccount>(list: T[]): T[] {
  return list
    .filter((p) => String((p as any)?.id ?? "").trim().length > 0)
    .sort((a, b) => score(b) - score(a));
}

/** Pick the Page to publish with; an explicit user choice always wins. */
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
