/** Slider movement may select zero or an amount inside the configured range, never the gap. */
export function thresholdOffer(next: number, min: number, max: number, previous?: number) {
  if (!Number.isFinite(next) || next <= 0) return 0;
  if (next < min && previous !== undefined && next < previous) return 0;
  return Math.min(max, Math.max(min, next));
}

export function offerScale(min: number, max: number, step: number) {
  const count = Math.round((max - min) / step) + 1;
  return {
    max: count,
    position: (value: number) => value <= 0 ? 0 : Math.min(count, Math.max(1, Math.round((value - min) / step) + 1)),
    amount: (position: number) => position <= 0 ? 0 : Number(Math.min(max, min + (position - 1) * step).toFixed(6)),
  };
}