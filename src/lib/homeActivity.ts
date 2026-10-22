export type HomeActivity = { properties: number; leads: number; marketing: number; earnings: number };

export function hasHomeActivity(metrics: HomeActivity): boolean {
  return Object.values(metrics).some(value => Number.isFinite(value) && value > 0);
}

export function listingDistribution(affiliateEnabled: boolean): 'network' | 'site' {
  return affiliateEnabled ? 'network' : 'site';
}