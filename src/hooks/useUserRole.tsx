import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type AppRole = 'admin' | 'moderator' | 'user' | 'super_admin';

// Hardcoded super-admin override - bypasses any state delays.
const SUPER_ADMIN_EMAILS = ['sgalili@gmail.com'];

export function useUserRole() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['user-roles', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user!.id);
      if (error) return [] as AppRole[];
      return (data ?? []).map((r) => r.role as AppRole);
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  // Force re-sync of role data whenever the user id changes (e.g. after login).
  useEffect(() => {
    if (user?.id) {
      queryClient.invalidateQueries({ queryKey: ['user-roles', user.id] });
    }
  }, [user?.id, queryClient]);

  const emailOverride = !!user?.email && SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase());
  const isSuperAdmin = roles.includes('super_admin') || emailOverride;
  const isAdmin = roles.includes('admin') || isSuperAdmin;
  const isModerator = roles.includes('moderator') || isAdmin;

  return { roles, isAdmin, isSuperAdmin, isModerator, loading: isLoading };
}
