import type { AppRole } from '@/hooks/useUserRole';
export type ActivityAudience = 'partner' | 'private' | 'professional';
export function activityAudience(roles: AppRole[], partnerMode: boolean): ActivityAudience {
  const professional = roles.some(role => ['developer', 'managing_broker', 'lead_agent', 'agent', 'assistant', 'junior_agent', 'super_admin', 'admin', 'moderator'].includes(role));
  if (partnerMode || (roles.includes('affiliate') && !professional && !roles.includes('property_owner') && !roles.includes('property_seeker'))) return 'partner';
  return professional ? 'professional' : 'private';
}