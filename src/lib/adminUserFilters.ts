export type AdminUserFilters = { role: string; status: string; gender: string };
export const emptyAdminUserFilters: AdminUserFilters = { role: 'all', status: 'all', gender: 'all' };
export const hasNewAdminItems = (count: number | undefined) => typeof count === 'number' && count > 0;
export function matchesAdminUser(profile: { full_name?: string | null; email?: string | null; phone?: string | null; city?: string | null; gender?: string | null; is_suspended?: boolean | null }, roles: string[], search: string, filters: AdminUserFilters) {
  const text = [profile.full_name, profile.email, profile.phone, profile.city].filter(Boolean).join(' ').toLowerCase();
  return text.includes(search.trim().toLowerCase()) &&
    (filters.role === 'all' || roles.includes(filters.role)) &&
    (filters.status === 'all' || (filters.status === 'suspended' ? !!profile.is_suspended : !profile.is_suspended)) &&
    (filters.gender === 'all' || profile.gender === filters.gender);
}