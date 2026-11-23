import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';

/** Super Admin-only background reads run only for a confirmed Super Admin and are keyed by the signed-in user. */
export function useSuperAdminGate() {
  const { isSuperAdmin, loading } = useUserRole();
  const { user } = useAuth();
  return { enabled: !loading && isSuperAdmin && !!user, uid: user?.id ?? 'anon' };
}
