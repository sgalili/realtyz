import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';

export type AccountIntegrations = {
  facebook: {
    pageId: string | null;
    pageName: string | null;
    pageAvatarUrl: string | null;
    hasToken: boolean;
    isShared: boolean;
  } | null;
  waPhone: string | null;
  greenPhone: string | null;
  greenConnected: boolean;
  yad2Connected: boolean;
};

export const ACCOUNT_INTEGRATIONS_KEY = 'account-integrations';

/**
 * Integration status for the ACTIVE workspace only. The server resolves the
 * active workspace; the query key includes it so switching workspaces never
 * shows the previous workspace's connections.
 */
export function useAccountIntegrations() {
  const { user } = useAuth();
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  return useQuery<AccountIntegrations>({
    queryKey: [ACCOUNT_INTEGRATIONS_KEY, user?.id, workspaceOwnerId],
    enabled: !!user?.id && !!workspaceOwnerId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data } = await supabase.rpc('get_account_integrations' as never);
      const row = (data ?? {}) as Record<string, any>;
      const fb = row.facebook ?? null;
      return {
        facebook: fb?.page_id
          ? {
              pageId: String(fb.page_id),
              pageName: fb.page_name ?? null,
              pageAvatarUrl: fb.page_avatar_url ?? null,
              hasToken: !!fb.has_token,
              isShared: false,
            }
          : null,
        waPhone: row.wa_phone ?? null,
        greenPhone: row.green_phone ?? null,
        greenConnected: !!row.green_connected,
        yad2Connected: !!row.yad2_connected,
      };
    },
  });
}
