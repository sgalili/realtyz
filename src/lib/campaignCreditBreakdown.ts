/** Readback-only charge snapshot; never infer a publication count from money. */
export function campaignCreditBreakdown(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const created = row['posts_created']; const published = row['groups_published'];
  if (typeof created !== 'number' || typeof published !== 'number' || !Number.isInteger(created) || !Number.isInteger(published) || created < 0 || published < 0) return null;
  return { created, published, creationCredits: created, publishCredits: published, totalCredits: created + published };
}