import type { AppRole } from '@/hooks/useUserRole';

/** Affiliate membership is additive and must never replace a core identity. */
export function accountIdentity(roles: AppRole[], primaryType?: string | null) {
  const team = roles.some((role) => ['admin', 'super_admin', 'moderator', 'managing_broker', 'lead_agent', 'agent', 'assistant', 'junior_agent'].includes(role));
  if (roles.includes('developer') && !roles.includes('super_admin')) return { label: primaryType === 'contractor' ? 'קבלן' : 'יזם', home: '/developer-dashboard', canSwitch: true };
  if (team) return { label: 'מתווך', home: '/', canSwitch: true };
  if (roles.includes('property_owner')) return { label: 'מפרסם', home: '/owner/properties', canSwitch: true };
  if (roles.includes('property_seeker')) return { label: 'פרטי', home: '/public-listings', canSwitch: true };
  if (roles.includes('user') && !roles.includes('affiliate')) return { label: 'פרטי', home: '/public-listings', canSwitch: true };
  return { label: 'שותף', home: '/affiliate-network', canSwitch: false };
}

export function isAffiliateOnlyAccount(roles: AppRole[]) {
  return roles.includes('affiliate') && !accountIdentity(roles).canSwitch;
}