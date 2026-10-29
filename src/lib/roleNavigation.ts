import type { ActivityAudience } from './activityAudience';
export const PERSONAL_PATHS = ['/public-listings', '/my-ads', '/activity-history', '/command-center', '/tasks', '/deal-room', '/campaigns', '/posts', '/inbox', '/communication', '/referral', '/profile', '/wallet'];
export function rolePageAllowed(audience: ActivityAudience, path: string): boolean {
  if (audience === 'professional') return true;
  if (path === '/') return true;
  const paths = audience === 'partner' ? [...PERSONAL_PATHS, '/affiliate', '/affiliates', '/affiliate-pricing', '/affiliate-network', '/partner'] : PERSONAL_PATHS;
  return paths.some(p => path === p || path.startsWith(`${p}/`));
}