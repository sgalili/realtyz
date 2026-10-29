import { useWorkspace } from '@/hooks/useWorkspace';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isAffiliateOnlyAccount } from '@/lib/accountMode';

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
  | 'affiliate'
  | 'property_owner'
  | 'property_seeker'
  | 'developer';

export const userRolesQueryKey = (userId: string | undefined) => ['user-roles', userId] as const;

export function useUserRole() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();
  const { data: ownRoles = [], isLoading, isFetched, isError, refetch } = useQuery({
    queryKey: userRolesQueryKey(user?.id),
    enabled: !!user?.id,
    queryFn: async () => {
      if (!user?.id) return [] as AppRole[];
      const { data, error } = await supabase.rpc('get_verified_user_roles');
      if (error) throw error;
      return (data ?? []) as AppRole[];
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  // Force re-sync of role data whenever the user id changes (e.g. after login).
  useEffect(() => {
    if (user?.id) {
      queryClient.invalidateQueries({ queryKey: ['user-roles', user.id] });
    }
  }, [user?.id, queryClient]);

  const isSuperAdmin = ownRoles.includes('super_admin');
  // A Super Admin inside another user's workspace sees that owner's role
  // context; only the super_admin flag survives for admin overlays.
  const viewingOther = isSuperAdmin && !!user?.id && !!activeWorkspaceId && activeWorkspaceId !== user.id && !wsLoading;
  const ownerRolesQuery = useQuery({
    queryKey: ['workspace-owner-roles', activeWorkspaceId],
    enabled: viewingOther,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as CallableFunction)('get_workspace_owner_roles', { _owner: activeWorkspaceId }) as { data: string[] | null; error: unknown };
      if (error) throw error;
      return (data ?? []) as AppRole[];
    },
    staleTime: 60_000,
  });
  const roles: AppRole[] = viewingOther
    ? [...(ownerRolesQuery.data ?? []).filter(r => r !== 'super_admin' && r !== 'admin'), 'super_admin']
    : ownRoles;
  const isAdmin = viewingOther ? false : roles.includes('admin') || isSuperAdmin;
  const isModerator = roles.includes('moderator') || isAdmin;

  // --- Real-estate team roles ---
  const isManagingBroker = roles.includes('managing_broker') || isAdmin;
  const isLeadAgent = roles.includes('lead_agent') || isManagingBroker;
  const isAgent = roles.includes('agent') || isLeadAgent;
  const isAssistant = roles.includes('assistant');
  const isJuniorAgent = roles.includes('junior_agent');
  const isAffiliate = roles.includes('affiliate');
  const isPropertyOwner = roles.includes('property_owner');
  const isPropertySeeker = roles.includes('property_seeker');
  const isDeveloper = roles.includes('developer');
  const isTeamMember =
    isManagingBroker || isLeadAgent || isAgent || isAssistant || isJuniorAgent || isAdmin;

  // True only when `affiliate` is the user's ONLY role. Affiliate-only accounts
  // are external marketers: every broker tool, CRM screen and office setting is
  // hidden from them and they are routed to the affiliate portal instead.
  const isAffiliateOnly = isAffiliateOnlyAccount(roles.filter(r => r !== 'super_admin'));

  // Private property owners are NOT brokers and NOT affiliates: they only get
  // their own listings, the leads interested in them, the reward settings and
  // Rita. Every broker CRM tool, recruitment screen and affiliate management
  // surface stays hidden for them.
  const isPropertyOwnerOnly = isPropertyOwner && !isTeamMember && !isModerator && !isDeveloper;
  const isPropertySeekerOnly = isPropertySeeker && !isTeamMember && !isModerator && !isDeveloper && !isPropertyOwner;

  // True only when junior_agent is the user's *highest* role.
  // Used for Junior-Agent UI restrictions (own-leads-only view).
  const isJuniorOnly =
    isJuniorAgent && !isAssistant && !isAgent && !isLeadAgent && !isManagingBroker && !isAdmin;


  // --- Permissions (mirror DB helpers in supabase migrations) ---
  // Close deals: Managing Broker, Lead Agent, Agent, Admin, Super Admin.
  const canCloseDeals = isAgent && !isDeveloper;
  // Closing Room (contracts): same set as can-close (Assistant + Junior blocked).
  const canUseClosingRoom = canCloseDeals;
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
    isPropertyOwner,
    isPropertyOwnerOnly,
    isPropertySeeker,
    isPropertySeekerOnly,
    isDeveloper,
    isTeamMember,

    canCloseDeals,
    canUseClosingRoom,
    canDeleteLeads,
    canManageData,
    canAccessBilling,
    canInviteTeam,
    canAssignLeads,
    loading: isLoading || (viewingOther && ownerRolesQuery.isLoading),
    fetched: isFetched && (!viewingOther || ownerRolesQuery.isFetched),
    error: isError,
    refetch,
  };
}
