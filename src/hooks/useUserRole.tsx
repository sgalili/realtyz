import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type AppRole =
  | 'admin'
  | 'moderator'
  | 'user'
  | 'super_admin'
  | 'managing_broker'
  | 'lead_agent'
  | 'agent'
  | 'assistant'
  | 'junior_agent'
  | 'affiliate';

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

  // --- Real-estate team roles ---
  const isManagingBroker = roles.includes('managing_broker') || isAdmin;
  const isLeadAgent = roles.includes('lead_agent') || isManagingBroker;
  const isAgent = roles.includes('agent') || isLeadAgent;
  const isAssistant = roles.includes('assistant');
  const isJuniorAgent = roles.includes('junior_agent');
  const isAffiliate = roles.includes('affiliate');
  const isTeamMember =
    isManagingBroker || isLeadAgent || isAgent || isAssistant || isJuniorAgent || isAdmin;

  // True only when `affiliate` is the user's ONLY role. Affiliate-only accounts
  // are external marketers: every broker tool, CRM screen and office setting is
  // hidden from them and they are routed to the affiliate portal instead.
  const isAffiliateOnly = isAffiliate && !isTeamMember && !isModerator;

  // True only when junior_agent is the user's *highest* role.
  // Used for Junior-Agent UI restrictions (own-leads-only view).
  const isJuniorOnly =
    isJuniorAgent && !isAssistant && !isAgent && !isLeadAgent && !isManagingBroker && !isAdmin;


  // --- Permissions (mirror DB helpers in supabase migrations) ---
  // Close deals: Managing Broker, Lead Agent, Agent, Admin, Super Admin.
  const canCloseDeals = isAgent;
  // Closing Room (contracts): same set as can-close (Assistant + Junior blocked).
  const canUseClosingRoom = isAgent;
  // Delete leads: Managing Broker, Lead Agent, Agent, Admin, Super Admin.
  const canDeleteLeads = isAgent;
  // Strategy Bank + Deal Room data ingestion: any team member.
  const canManageData = isTeamMember;
  // Billing & subscription: Managing Broker / Admin only.
  const canAccessBilling = isManagingBroker;
  // Invite teammates / change roles: Managing Broker / Admin only.
  const canInviteTeam = isManagingBroker;
  // Delegate leads (Assign To): Managing Broker or Lead Agent.
  const canAssignLeads = isLeadAgent;

  return {
    roles,
    isAdmin,
    isSuperAdmin,
    isModerator,
    isManagingBroker,
    isLeadAgent,
    isAgent,
    isAssistant,
    isJuniorAgent,
    isJuniorOnly,
    isAffiliate,
    isAffiliateOnly,
    isTeamMember,

    canCloseDeals,
    canUseClosingRoom,
    canDeleteLeads,
    canManageData,
    canAccessBilling,
    canInviteTeam,
    canAssignLeads,
    loading: isLoading,
  };
}
