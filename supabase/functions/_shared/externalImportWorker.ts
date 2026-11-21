export const IMPORT_COUNTERS = ['brokers_done', 'developers_done', 'listings_done', 'projects_done', 'units_done', 'skipped'] as const;

export function validExternalCounts(counts: unknown): counts is Record<string, number> {
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return false;
  return Object.entries(counts).every(([key, value]) =>
    IMPORT_COUNTERS.some(name => name === key) && Number.isInteger(value) && value >= 0 && value <= 2147483647);
}

export function validWorkerCredential(configured: string, supplied: string): boolean {
  if (configured.length < 32 || configured.length !== supplied.length) return false;
  let difference = 0;
  for (let i = 0; i < configured.length; i++) difference |= configured.charCodeAt(i) ^ supplied.charCodeAt(i);
  return difference === 0;
}