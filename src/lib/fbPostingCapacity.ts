export type FbPostingCapacity = {
  per_page_limit: number;
  account_limit: number;
  account_used: number;
  pages: { page_id: string; page_name: string | null; used: number }[];
};

/** Mirrors the server claim rule: 35 per page, 100 per account across all pages. */
export function summarizeCapacity(c: FbPostingCapacity | null | undefined) {
  if (!c) return null;
  const pageCount = Math.max(1, c.pages.length);
  const total = Math.min(c.per_page_limit * pageCount, c.account_limit);
  const pagesFull = c.pages.length > 0 && c.pages.every((p) => p.used >= c.per_page_limit);
  const accountFull = c.account_used >= c.account_limit;
  const canAddPage = !accountFull && c.per_page_limit * pageCount < c.account_limit;
  return { total, used: Math.min(c.account_used, total), reached: accountFull || pagesFull || c.account_used >= total, accountFull, canAddPage };
}
