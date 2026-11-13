export type BulkPricePatch = { t1?: string; t2?: string; t3?: string; t4?: string; unit?: 'fixed' | 'percent' };

/** Shared edits never overwrite a property explicitly switched to individual pricing. */
export function applyBulkPublicationPricing<T extends BulkPricePatch>(drafts: Record<string, T>, ids: string[], overrides: Set<string>, patch: BulkPricePatch): Record<string, T> {
  const next = { ...drafts };
  for (const id of ids) {
    const current = next[id];
    if (current && !overrides.has(id)) next[id] = { ...current, ...patch };
  }
  return next;
}