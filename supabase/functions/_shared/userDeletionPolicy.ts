export function userDeletionProtection(callerId: string, targetId: string, roles: string[]) {
  if (callerId === targetId) return 'skipped_self';
  if (roles.includes('super_admin')) return 'skipped_super_admin';
  return null;
}