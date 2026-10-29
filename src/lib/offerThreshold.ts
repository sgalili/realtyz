/** Slider movement may select zero or an amount inside the configured range, never the gap. */
export function thresholdOffer(next: number, min: number, max: number, previous?: number) {
  if (!Number.isFinite(next) || next <= 0) return 0;
  if (next < min && previous !== undefined && next < previous) return 0;
  return Math.min(max, Math.max(min, next));
}