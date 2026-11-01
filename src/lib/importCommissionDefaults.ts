export type ImportCommissionRule = {
  /** Closing fee on sale ads, percent of the asking price. */
  salePercent: number;
  /** Closing fee on rental ads, percent of one month's rent (paid as a fixed ₪ amount). */
  rentMonthlyPercent: number;
  form: number;
  whatsapp: number;
  phone: number;
};

export const DEFAULT_IMPORT_RULE: ImportCommissionRule = { salePercent: 1, rentMonthlyPercent: 20, form: 0, whatsapp: 0, phone: 0 };

const isRent = (dealType?: string | null) => /rent/i.test(String(dealType ?? ''));

/** Listing reward columns for an imported ad under the given rule. */
export function importCommissionPayload(dealType: string | null | undefined, price: number, rule: ImportCommissionRule = DEFAULT_IMPORT_RULE) {
  const closing = isRent(dealType)
    ? { type: 'fixed' as const, value: Math.round((Math.max(0, price) * rule.rentMonthlyPercent) / 100) }
    : { type: 'percent' as const, value: rule.salePercent };
  return {
    affiliate_tier1_amount: rule.form, affiliate_tier2_amount: rule.whatsapp, affiliate_tier3_amount: rule.phone,
    affiliate_tier4_type: closing.type, affiliate_tier4_amount: closing.value,
    closing,
  };
}

const key = (userId: string, workspaceId: string) => `toraff-import-rule:${userId}:${workspaceId}`;
export function readImportRule(userId: string, workspaceId: string): ImportCommissionRule {
  try { return { ...DEFAULT_IMPORT_RULE, ...JSON.parse(localStorage.getItem(key(userId, workspaceId)) ?? '{}') }; } catch { return DEFAULT_IMPORT_RULE; }
}
export function saveImportRule(userId: string, workspaceId: string, rule: ImportCommissionRule) {
  localStorage.setItem(key(userId, workspaceId), JSON.stringify(rule));
}

/** Runs tasks with bounded parallelism; each result is reported as soon as it settles. */
export async function runPool<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => { while (next < items.length) { const item = items[next++]; await task(item).catch(() => {}); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
