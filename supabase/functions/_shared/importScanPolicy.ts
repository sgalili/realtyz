// A single slow discovery page must not occupy the whole platform request budget.
export const IMPORT_DISCOVERY_BUDGET_MS = 50_000;
export const IMPORT_QUEUE_GAP_MS = 1_000;
export const MAX_DEVELOPER_PAGE_RETRIES = 3;

export function canRetryDeveloperPage(attempt: number): boolean {
  return attempt < MAX_DEVELOPER_PAGE_RETRIES;
}