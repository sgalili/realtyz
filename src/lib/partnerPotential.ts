export function partnerPotential(progress: number) {
  const normalized = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return { count: 1 + Math.round(normalized * 99), level: Math.min(3, Math.floor(normalized * 4)), icons: 1 + Math.round(normalized * 5) };
}