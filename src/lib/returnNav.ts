/**
 * Return-navigation helpers: remember the originating page (path + query +
 * hash) and scroll position so destination back buttons return the user to
 * the exact page and section they started from.
 */
export type ReturnState = { returnTo?: string; returnScroll?: number; restoreScroll?: number };

export function returnState(): ReturnState {
  if (typeof window === "undefined") return {};
  const { pathname, search, hash } = window.location;
  return { returnTo: `${pathname}${search}${hash}`, returnScroll: window.scrollY };
}

export function readReturn(state: unknown): ReturnState | null {
  const s = state as ReturnState | null;
  return s && typeof s.returnTo === "string" && s.returnTo.startsWith("/") ? s : null;
}
