// Shekel currency helper. ₪ always renders to the LEFT of the digits.
// In RTL flows, wrap the output in <bdi dir="ltr"> to lock visual order.
export const fmtILS = (
  value: number | null | undefined,
  opts: { fractionDigits?: number; fallback?: string } = {},
): string => {
  const { fractionDigits = 0, fallback = '—' } = opts;
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return `₪${value.toLocaleString('he-IL', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
};

/**
 * JSX-friendly render: returns a <bdi> string that callers should embed in JSX.
 * Prefer `<PriceTag value={n} />` from `@/components/PriceTag` for components.
 */
export const fmtILSCompact = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `₪${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `₪${(value / 1_000).toFixed(0)}K`;
  return fmtILS(value);
};
