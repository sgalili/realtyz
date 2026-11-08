export type ImportCommissionRule = {
  /** Closing fee on sale ads, percent of the asking price. */
  salePercent: number;
  /** Closing fee on rental ads, percent of one month's rent (paid as a fixed ₪ amount). */
  rentMonthlyPercent: number;
  form: number;
  whatsapp: number;
  phone: number;
};

export const DEFAULT_IMPORT_RULE: ImportCommissionRule = { salePercent: 0.5, rentMonthlyPercent: 20, form: 0, whatsapp: 0, phone: 0 };

export type ImportDealType = 'sale' | 'rent';
export const IMPORT_CLOSING_RANGES = {
  sale: { min: 0.2, max: 2, step: 0.01 },
  rent: { min: 10, max: 100, step: 1 },
};
export function importDealType(dealType?: string | null): ImportDealType {
  return /rent|השכרה|שכירות/i.test(String(dealType ?? '')) ? 'rent' : 'sale';
}
export function importBatchDealTypes(types: Array<string | null | undefined>): ImportDealType[] {
  return (['sale', 'rent'] as const).filter(type => types.some(value => importDealType(value) === type));
}
export function canApplyImportRule(rule: ImportCommissionRule, types: ImportDealType[], accepted: boolean) {
  return accepted && types.length > 0 && types.every(type => {
    const value = type === 'sale' ? rule.salePercent : rule.rentMonthlyPercent;
    const range = IMPORT_CLOSING_RANGES[type];
    return Number.isFinite(value) && value >= range.min && value <= range.max;
  }) && [rule.form, rule.whatsapp, rule.phone].every(value => Number.isFinite(value) && value >= 0);
}

const isRent = (dealType?: string | null) => importDealType(dealType) === 'rent';

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
  try {
    const stored = { ...DEFAULT_IMPORT_RULE, ...JSON.parse(localStorage.getItem(key(userId, workspaceId)) ?? '{}') };
    for (const [field, type] of [['salePercent', 'sale'], ['rentMonthlyPercent', 'rent']] as const) {
      const range = IMPORT_CLOSING_RANGES[type];
      if (!Number.isFinite(stored[field]) || stored[field] < range.min || stored[field] > range.max) stored[field] = DEFAULT_IMPORT_RULE[field];
    }
    return stored;
  } catch { return { ...DEFAULT_IMPORT_RULE }; }
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
