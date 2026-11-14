export const PAGE_LOADING_MINIMUM_MS = 2_000;
export function remainingPageLoadingTime(startedAt: number, now: number) {
  return Math.max(0, PAGE_LOADING_MINIMUM_MS - (now - startedAt));
}