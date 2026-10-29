import { describe, it, expect } from 'vitest';
import { summarizeCapacity } from './fbPostingCapacity';

const pages = (n: number, used: number) => Array.from({ length: n }, (_, i) => ({ page_id: String(i), page_name: null, used }));

describe('summarizeCapacity', () => {
  it('gives 35 per page', () => {
    expect(summarizeCapacity({ per_page_limit: 35, account_limit: 100, account_used: 0, pages: pages(2, 0) })!.total).toBe(70);
  });
  it('caps all pages together at 100', () => {
    expect(summarizeCapacity({ per_page_limit: 35, account_limit: 100, account_used: 0, pages: pages(4, 0) })!.total).toBe(100);
  });
  it('offers another page when the single page is full', () => {
    const s = summarizeCapacity({ per_page_limit: 35, account_limit: 100, account_used: 35, pages: pages(1, 35) })!;
    expect(s.reached).toBe(true);
    expect(s.canAddPage).toBe(true);
  });
  it('no extra page once the account ceiling is reached', () => {
    const s = summarizeCapacity({ per_page_limit: 35, account_limit: 100, account_used: 100, pages: pages(3, 34) })!;
    expect(s.reached).toBe(true);
    expect(s.canAddPage).toBe(false);
  });
});
