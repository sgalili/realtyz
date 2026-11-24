/**
 * Route guards, page loaders and lazily loaded pages, moved verbatim from the
 * former src/App.tsx. Route files under src/routes/ compose these exactly as
 * the old <Route element={...}> entries did.
 */
import { ImportedLicenseGate } from '@/components/onboarding/ImportedLicenseGate';
import * as React from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { PlatformMetadata } from '@/components/PlatformMetadata';
import { PublicWorkspaceProvider, InitialDemoWorkspaceChoice, publicWorkspaceRoute, usePublicWorkspace } from '@/components/demo/PublicWorkspaceProvider';
import { installPublicWorkspaceTransport } from '@/lib/publicWorkspaceTransport';
import { BrokerDemoRouteGate } from '@/components/demo/BrokerDemoRouteGate';
import { InventoryComingSoonHost } from '@/components/InventoryCollection';
import { CreditRateSync } from "@/hooks/useCreditRate";
import { QueryClient, QueryClientProvider, useQueryClient, useQuery } from "@tanstack/react-query";
import { Navigate, useLocation, useParams } from "@/lib/router-compat";
import { supabase } from '@/integrations/supabase/client';
import { DirectionProvider } from "@radix-ui/react-direction";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { DemoViewBar } from "@/components/demo/DemoViewBar";
import { PersonalLanguageProvider } from '@/i18n/personalLanguage';
import { useUserRole } from "@/hooks/useUserRole";
import { usePropertyPageAccess } from '@/hooks/usePropertyPageAccess';
import { WhiteLabelProvider } from "@/hooks/useWhiteLabel";
import { AppLayout } from "@/components/AppLayout";
import { PendingMessageResume } from "@/components/community/SendProfileMessage";
import { PublicProfileShell } from "@/components/public/PublicProfileShell";
import { SocialDraftChargeDialog } from '@/components/campaigns/SocialDraftChargeDialog';
import { InactiveYad2ImportDialog } from '@/components/properties/InactiveYad2ImportDialog';
import { AppFooter } from "@/components/AppFooter";
import { FaqHost } from "@/components/faq/FaqDialog";
import { DemoModeProvider } from "@/hooks/useDemoMode";
import { ElectionTypeProvider } from "@/hooks/useElectionType";
import { MandateProvider } from "@/hooks/useMandate";
import { WorkspaceProvider, useWorkspace } from "@/hooks/useWorkspace";
import { writeAppMode } from '@/hooks/useAppMode';
import { ReferralCapture } from '@/components/referrals/ReferralCapture';
import { WorkspaceSelectorModal } from "@/components/workspace/WorkspaceSelectorModal";
import { RouteScrollRestoration } from "@/components/navigation/RouteScrollRestoration";
import { toast } from "sonner";
import { Suspense } from "react";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
export const OAuthConsent = lazy(() => import("@/pages/OAuthConsent"));
import { FullPageLoading as RealtyzLoader, FullPageLoadingProvider } from '@/components/ui/full-page-loading';
import Auth from "@/pages/Auth";
import ResetPassword from "@/pages/ResetPassword";
import { useWorkspaceFeatures } from "@/hooks/useWorkspaceFeatures";
import { CreditsUpgradeDialog } from '@/components/billing/CreditsUpgradeDialog';
import { usePlatformMode, type PlatformMode } from '@/hooks/usePlatformMode';
import { applyPendingSignupRole, readPostSignupWelcome } from '@/lib/signupRole';
import { PostSignupWelcome } from '@/components/onboarding/PostSignupWelcome';
import { useEarningsFeedback } from '@/hooks/useEarningsFeedback';
import { useCreditWallet } from '@/hooks/useSubscription';
import RoleChoiceStep from '@/components/auth/RoleChoiceStep';
import { useAppMode, isPartnerModePath } from '@/hooks/useAppMode';
import { accountIdentity } from '@/lib/accountMode';
import { activityAudience } from '@/lib/activityAudience';
import { canOpenPropertyManagement } from '@/lib/propertyMenuPolicy';
import { rolePageAllowed, PERSONAL_PATHS } from '@/lib/roleNavigation';
import { usePartnerConsent } from '@/hooks/usePartnerConsent';
import { PartnerOnboarding } from '@/components/affiliate/PartnerOnboarding';
import { AccessibilityEffects } from '@/components/accessibility/AccessibilityEffects';

// Lazy load pages for better performance
export const Index = lazy(() => import("@/pages/Index"));
export const RoleTransactions = lazy(() => import('@/pages/RoleTransactions'));
export const SharingPool = lazy(() => import('@/pages/SharingPool'));
export const MyAds = lazy(() => import("@/pages/MyAds"));
export const PublishingHistory = lazy(() => import("@/pages/PublishingHistory"));
export const LeadCRM = lazy(() => import("@/pages/LeadCRM"));
export const OmnichannelInbox = lazy(() => import("@/pages/OmnichannelInbox"));
export const AIContentGenerator = lazy(() => import("@/pages/AIContentGenerator"));
export const CampaignCenter = lazy(() => import("@/pages/CampaignCenter"));
export const PublishingHub = lazy(() => import("@/pages/PublishingHub"));
import { BrokersOnlyGate } from "@/components/BrokersOnlyGate";
export const ActivityLog = lazy(() => import("@/pages/ActivityLog"));
export const Mailbox = lazy(() => import("@/pages/Mailbox"));
export const ApiSettings = lazy(() => import("@/pages/ApiSettings"));
export const Profile = lazy(() => import("@/pages/Profile"));
export const Billing = lazy(() => import("@/pages/Billing"));
export const ConnectionSettings = lazy(() => import("@/pages/ConnectionSettings"));
export const SentimentDashboard = lazy(() => import("@/pages/SentimentDashboard"));
export const SubscriptionManager = lazy(() => import("@/pages/SubscriptionManager"));
export const ContactForm = lazy(() => import("@/pages/ContactForm"));

export const LiveConversations = lazy(() => import("@/pages/LiveConversations"));
export const LiveActivity = lazy(() => import("@/pages/LiveActivity"));
export const ConversationAnalytics = lazy(() => import("@/pages/ConversationAnalytics"));
export const SecurityDashboard = lazy(() => import("@/pages/SecurityDashboard"));
export const PrivacyDashboard = lazy(() => import("@/pages/PrivacyDashboard"));
export const MassiveImporter = lazy(() => import("@/pages/MassiveImporter"));

export const SuperAdmin = lazy(() => import("@/pages/SuperAdmin"));
export const Finance = lazy(() => import("@/pages/Finance"));
export const KnowledgeBase = lazy(() => import("@/pages/KnowledgeBase"));
export const PublicListingPage = lazy(() => import("@/pages/PublicListingPage"));
export const CommunityProfilePage = lazy(() => import("@/pages/CommunityProfilePage"));
export const LeadPublicProfilePage = lazy(() => import("@/pages/LeadPublicProfilePage"));
export function LegacyProfileRedirect({ to }: { to: "broker" | "agency" }) {
  const { userId } = useParams();
  return <Navigate to={`/${to}/${encodeURIComponent(userId ?? "")}`} replace />;
}
export const CommunityOfficePage = lazy(() => import("@/pages/CommunityOfficePage"));
export const ShortLinkRedirect = lazy(() => import("@/pages/ShortLinkRedirect"));
export const DynamicQrRedirect = lazy(() => import("@/pages/DynamicQrRedirect"));
export const Unsubscribe = lazy(() => import("@/pages/Unsubscribe"));
export const SocialConnect = lazy(() => import("@/pages/SocialConnect"));
export const OAuthCallback = lazy(() => import("@/pages/OAuthCallback"));
export const NotFound = lazy(() => import("@/pages/NotFound"));
export const DealRoom = lazy(() => import("@/pages/DealRoom"));
export const PerformanceInsights = lazy(() => import("@/pages/PerformanceInsights"));
export const BusinessPerformance = lazy(() => import("@/pages/BusinessPerformance"));
export const Broadcast = lazy(() => import("@/pages/Broadcast"));
export const AutomationStudioPage = lazy(() => import("@/pages/AutomationStudioPage"));
export const Team = lazy(() => import("@/pages/Team"));
export const SignDocument = lazy(() => import("@/pages/SignDocument"));
export const Properties = lazy(() => import("@/pages/Properties"));
export const PropertiesHub = lazy(() => import("@/pages/PropertiesHub"));
export const PropertyDetail = lazy(() => import("@/pages/PropertyDetail"));
export const CrmProfile = lazy(() => import("@/pages/CrmProfile"));
export const WhiteLabelSettings = lazy(() => import("@/pages/WhiteLabelSettings"));
export const SystemHealth = lazy(() => import("@/pages/SystemHealth"));
export const SharedDeals = lazy(() => import("@/pages/SharedDeals"));
export const ClientPortal = lazy(() => import("@/pages/ClientPortal"));
export const TourConfirm = lazy(() => import("@/pages/TourConfirm"));
export const SharedProperty = lazy(() => import("@/pages/SharedProperty"));
export const PlatformSettings = lazy(() => import("@/pages/PlatformSettings"));
export const HomelyAdmin = lazy(() => import("@/pages/HomelyAdmin"));
export const AiDialer = lazy(() => import("@/pages/AiDialer"));
export const PlatformCredentials = lazy(() => import("@/pages/PlatformCredentials"));
export const FbEngagement = lazy(() => import("@/pages/FbEngagement"));
export const CommandCenter = lazy(() => import("@/pages/CommandCenter"));
export const DigitalSignatures = lazy(() => import("@/pages/DigitalSignatures"));
export const AffiliateSignup = lazy(() => import("@/pages/AffiliateSignup"));
export const AffiliateNetwork = lazy(() => import("@/pages/AffiliateNetwork"));
export const PartnerChats = lazy(() => import("@/pages/partner/PartnerChats"));
export const PartnerContacts = lazy(() => import("@/pages/partner/PartnerContacts"));
export const PartnerNetwork = lazy(() => import("@/pages/PartnerNetwork"));
export const PublicListingsBoard = lazy(() => import("@/pages/PublicListingsBoard"));
export const AboutToraff = lazy(() => import('@/pages/AboutToraff'));
export const FaqPage = lazy(() => import('@/pages/FaqPage'));
export const Developers = lazy(() => import("@/pages/Developers"));
export const Wallet = lazy(() => import("@/pages/Wallet"));
export const DeveloperDashboard = lazy(() => import("@/pages/DeveloperDashboard"));
export const OurClients = lazy(() => import("@/pages/OurClients"));
export const OwnerLeads = lazy(() => import("@/pages/owner/OwnerLeads"));
export const OwnerRewards = lazy(() => import("@/pages/owner/OwnerRewards"));
export const OwnerRita = lazy(() => import("@/pages/owner/OwnerRita"));

export const Landing = lazy(() => import("@/pages/Landing"));
export const Terms = lazy(() => import("@/pages/Terms"));
export const CommissionMechanism = lazy(() => import("@/pages/CommissionMechanism"));
export const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));

export function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <RealtyzLoader size="lg" label="טוען..." />
    </div>
  );
}

/**
 * Routes an affiliate-only account is allowed to reach. Everything else in the
 * app (CRM, properties, posts, office settings) belongs to brokers and is
 * redirected away, so an affiliate never sees broker tooling.
 */
const AFFILIATE_ALLOWED_PATHS = ['/', ...PERSONAL_PATHS, '/sharing-pool', '/affiliate', '/affiliates', '/affiliate-pricing', '/affiliate-network', '/partner/contacts', '/partner/chats', '/partner/posts'];

/**
 * Private property owners are a separate product: only their own properties,
 * the leads interested in them, the reward settings and Rita. Broker CRM,
 * recruitment and affiliate management are unreachable, not just hidden.
 */
export const OWNER_ALLOWED_PATHS = ['/', ...PERSONAL_PATHS, '/owner/properties', '/owner/leads', '/owner/rewards', '/owner/rita'];
const WALLET_LOCK_ALLOWED = ['/', '/wallet', '/profile', '/public-listings', '/billing', '/referral'];
const SEEKER_ALLOWED_PATHS = ['/', ...PERSONAL_PATHS];
const DEVELOPER_ALLOWED_PATHS = ['/', '/wallet', '/public-listings', '/my-ads', '/profile', '/developer-dashboard', '/command-center', '/campaigns', '/lead-crm', '/inbox', '/affiliate-network', '/affiliate', '/referral', '/partner/contacts', '/partner/chats', '/posts', '/our-clients'];

export function ProtectedRoute({ children }: { children: React.ReactNode; allowGuestDemo?: boolean }) {
  const simulation = usePublicWorkspace();
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  // A role picked during registration (מתווך / שותף) is applied on the first
  // authenticated render, then the account lands on the matching product.
  const [roleApplied, setRoleApplied] = React.useState(false);
  React.useEffect(() => {
    if (simulation) { setRoleApplied(true); return; }
    if (!user || roleApplied) return;
    let alive = true;
    // Never let a failed or hanging completion step block the app after OTP:
    // errors and a bounded timeout still release the loader.
    const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 8000));
    void Promise.race([applyPendingSignupRole().catch(() => null), timeout]).then((path) => {
      if (!alive) return;
      if (path) {
        void queryClient.invalidateQueries({ queryKey: ['user-roles', user.id] });
        void queryClient.invalidateQueries({ queryKey: ['workspace-owner-roles'] });
        void queryClient.invalidateQueries({ queryKey: ['primary-user-type'] });
        void queryClient.invalidateQueries({ queryKey: ['app-header-user-profile', user.id] });
        void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      }
      setRoleApplied(true);
    });
    return () => { alive = false; };
  }, [user, roleApplied, queryClient]);
  const { data: walletState } = useCreditWallet();
  const walletLocked = !!walletState?.lockedAt;
  const { roles, accountRoles, isSuperAdmin, isAffiliate, isAffiliateOnly, isPropertyOwnerOnly, isPropertySeekerOnly, isDeveloper, loading: roleLoading, fetched: rolesFetched, error: roleError } = useUserRole();
  const { isPartnerMode } = useAppMode();
  const partnerConsent = usePartnerConsent();
  const location = useLocation();
  const { isDeveloperWorkspace } = useWorkspaceFeatures();
  if (loading) return user ? <AppLayout><PageLoader /></AppLayout> : (
    <div className="min-h-screen flex items-center justify-center">
      <RealtyzLoader size="lg" label="מאמת זהות..." />
    </div>
  );
  if (!user) return <Navigate to="/auth" replace />;
  if (roleLoading || !rolesFetched || !roleApplied) return <AppLayout><PageLoader /></AppLayout>;

  // Brand-new account (no role yet): pick מתווך / שותף once, then continue.
  if (roleError) return <AppLayout><div className="min-h-[60vh] flex items-center justify-center"><RealtyzLoader size="lg" label="מסנכרן הרשאות..." /></div></AppLayout>;

  if (rolesFetched && !roleLoading && (accountRoles.length === 0 || accountRoles.every(role => role === 'user'))) {
    if (!roleApplied) return <PageLoader />;
    if (location.pathname === '/profile') return <>{children}</>;
    return <Suspense fallback={<PageLoader />}><RoleChoiceStep /></Suspense>;
  }


  // Affiliate-only accounts are locked to the affiliate portal.
  const audience = activityAudience(roles, isPartnerMode);
  if (!rolePageAllowed(audience, location.pathname)) return <Navigate to="/public-listings" replace />;
  if (!roleLoading && isAffiliateOnly) {
    const allowed = AFFILIATE_ALLOWED_PATHS.some(
      (p) => location.pathname === p || location.pathname.startsWith(`${p}/`),
    );
    if (!allowed) return <Navigate to="/affiliate" replace />;
  }

  // Private property owners are locked to their own four screens.
  if (!roleLoading && isPropertyOwnerOnly && !(isPartnerMode && isAffiliate)) {
    const allowed = OWNER_ALLOWED_PATHS.some(
      (p) => location.pathname === p || location.pathname.startsWith(`${p}/`),
    );
    if (!allowed) return <Navigate to="/my-ads" replace />;
  }

  if (!roleLoading && (isPropertySeekerOnly || accountIdentity(roles).label === 'פרטי') && !(isPartnerMode && isAffiliate)) {
    const allowed = SEEKER_ALLOWED_PATHS.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`));
    if (!allowed) return <Navigate to="/public-listings" replace />;
  }

  // Developer product follows the WORKSPACE OWNER: entering a developer's
  // workspace (e.g. as super_admin) shows the developer experience too.
  const isDeveloperContext = isDeveloperWorkspace || (isDeveloper && !isSuperAdmin);
  if (isDeveloperContext && !(isPartnerMode && isAffiliate) && !DEVELOPER_ALLOWED_PATHS.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`))) {
    return <Navigate to="/developer-dashboard" replace />;
  }

  // Empty wallet + no successful card charge: everything but the wallet,
  // profile and public board is restricted until payment is settled.
  if (walletLocked && !isSuperAdmin && !WALLET_LOCK_ALLOWED.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`))) {
    return <Navigate to="/wallet" replace />;
  }

  // Partner mode (dual-role accounts) keeps broker tooling out of reach until
  // the user switches back to מצב מתווך from the header.
  if (isPartnerMode && isAffiliate && !isPartnerModePath(location.pathname)) {
    return <Navigate to="/affiliate" replace />;
  }

  if ((isPartnerMode || isAffiliateOnly) && isAffiliate && !['/', '/wallet', '/profile', '/public-listings', '/referral'].some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`))) {
    if (partnerConsent.isLoading) return <AppLayout><PageLoader /></AppLayout>;
    if (partnerConsent.data !== true && !readPostSignupWelcome()) return <AppLayout><PartnerOnboarding onComplete={() => void partnerConsent.refetch()} /></AppLayout>;
  }
  return <AppLayout><Suspense fallback={<PageLoader />}>{children}</Suspense></AppLayout>;
}

/** Root: guests see the public landing page, signed-in users get the app. */
/** The public marketing domain always opens the landing page at the root. */
const ROOT_MARKETING_HOSTS = new Set(['realtyz.co.il', 'www.realtyz.co.il']);

export function RootRoute() {
  const { user, loading } = useAuth();
  const { data: mode, isLoading: modeLoading } = usePlatformMode();
  const isMarketingHost = typeof window !== 'undefined' &&
    ROOT_MARKETING_HOSTS.has(window.location.hostname.toLowerCase());
  if (user && !loading) {
    let next: string | null = null;
    try { next = window.localStorage.getItem('realtyz-pending-oauth-consent'); } catch { /* */ }
    if (next && next.startsWith('/.lovable/oauth/consent')) return <Navigate to={next} replace />;
  }
  void isMarketingHost; // the public board is the homepage on every host
  if (loading && user) return (
    <div className="min-h-screen flex items-center justify-center">
      <RealtyzLoader size="lg" />
    </div>
  );
  if (modeLoading) return <PageLoader />;
  if (mode === 'brokers_only') {
    if (!user) return <Suspense fallback={<PageLoader />}><Landing /></Suspense>;
    // Brokers land on their property catalog; the dashboard stays in navigation.
    return <Navigate to="/properties" replace />;
  }
  if (!user) return <Suspense fallback={<PageLoader />}><PublicListingsBoard /></Suspense>;
  return <ProtectedRoute><Suspense fallback={<PageLoader />}><PublicListingsBoard embedded /></Suspense></ProtectedRoute>;
}


export function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  if (loading || roleLoading) return user ? <AppLayout><PageLoader /></AppLayout> : (
    <div className="min-h-screen flex items-center justify-center">
      <RealtyzLoader size="lg" label="מאמת הרשאות..." />
    </div>
  );
  if (!user || !isSuperAdmin) return <Navigate to="/" replace />;
  return <AppLayout><Suspense fallback={<PageLoader />}>{children}</Suspense></AppLayout>;
}

/**
 * Remounts the whole app tree when the active workspace changes, so sidebar,
 * dashboards, toggles and every tenant-scoped screen rebuild from scratch
 * instead of lingering on the previous workspace's state.
 */
export function WorkspaceScope({ children }: { children: React.ReactNode }) {
  const { activeWorkspaceId } = useWorkspace();
  const location = useLocation();
  // OAuth authorization codes are single-use. Workspace initialization can
  // change activeWorkspaceId while the callback is exchanging that code; using
  // the workspace as a key here would then unmount and restart the callback.
  const scopeKey = location.pathname === '/oauth/callback'
    ? 'oauth-callback'
    : activeWorkspaceId ?? 'no-workspace';
  return <React.Fragment key={scopeKey}>{children}</React.Fragment>;
}

/**
 * Route guards that follow the ACTIVE workspace. Rita's marketing workspace
 * has no properties, deal room or partner network, so those routes bounce to
 * the CRM there while staying fully available in every other workspace.
 */
export function ListingsRoute({ children }: { children: React.ReactNode }) {
  const { listingsEnabled } = useWorkspaceFeatures();
  const access = usePropertyPageAccess();
  const { isPartnerMode } = useAppMode();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  if (isPartnerMode) return <Navigate to="/public-listings" replace />;
  if (access.loading || roleLoading) return <PageLoader />;
  if (!canOpenPropertyManagement(access.properties, isSuperAdmin)) return <Navigate to="/my-ads" replace />;
  if (!listingsEnabled) return <Navigate to="/lead-crm" replace />;
  return <>{children}</>;
}

export function ProjectsRoute({ children }: { children: React.ReactNode }) {
  const access = usePropertyPageAccess();
  const { isPartnerMode } = useAppMode();
  if (isPartnerMode) return <Navigate to="/public-listings" replace />;
  if (access.loading) return <PageLoader />;
  if (!access.projects) return <Navigate to="/my-ads" replace />;
  return <>{children}</>;
}

/** My Ads editing stays separate from the broker inventory and fails closed under RLS. */
export function MyAdEditRoute() {
  const { id } = useParams();
  const { user } = useAuth();
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const listing = useQuery({
    queryKey: ['my-ad-edit-access', user?.id, activeWorkspaceId, id],
    enabled: !!user && !!id && !!activeWorkspaceId && !workspaceLoading,
    retry: false,
    queryFn: async () => {
      if (!id || !user || !activeWorkspaceId) return false;
      const { data, error } = await supabase.from('listings').select('id')
        .eq('id', id).eq('workspace_owner_id', activeWorkspaceId).eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
  if (workspaceLoading || listing.isLoading) return <PageLoader />;
  if (listing.isError || listing.data !== true) return <Navigate to="/my-ads" replace />;
  return <PropertyDetail />;
}

export function DealsRoute({ children }: { children: React.ReactNode }) {
  const { dealsEnabled } = useWorkspaceFeatures();
  const { roles } = useUserRole();
  const { isPartnerMode } = useAppMode();
  if (activityAudience(roles, isPartnerMode) !== 'professional') return <>{children}</>;
  if (!dealsEnabled) return <Navigate to="/lead-crm" replace />;
  return <>{children}</>;
}

export function PartnersRoute({ children }: { children: React.ReactNode }) {
  const { partnersEnabled } = useWorkspaceFeatures();
  const { isAffiliate } = useUserRole();
  const { isPartnerMode } = useAppMode();
  if (isAffiliate || isPartnerMode) return <>{children}</>;
  if (!partnersEnabled) return <Navigate to="/lead-crm" replace />;
  return <>{children}</>;
}

/**
 * Partner-exclusive surfaces (posts / chats / contacts). Only an affiliate
 * account — or a dual-role account currently in partner mode — may enter;
 * brokers and property owners are sent back to their own CRM.
 */
export function PartnerOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAffiliate, isAffiliateOnly, loading } = useUserRole();
  const { isPartnerMode } = useAppMode();
  if (loading) return null;
  if (isAffiliateOnly || (isAffiliate && isPartnerMode)) return <>{children}</>;
  return <Navigate to="/lead-crm" replace />;
}

export function AuthRoute() {
  const simulation = usePublicWorkspace();
  const { user, loading } = useAuth();
  React.useEffect(() => { if (simulation) window.location.assign('/auth'); }, [simulation]);
  if (simulation) return <PageLoader />;
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <RealtyzLoader size="lg" />
    </div>
  );
  if (user) {
    let next: string | null = null;
    try { next = window.localStorage.getItem('realtyz-pending-oauth-consent'); } catch { /* */ }
    if (next && next.startsWith('/.lovable/oauth/consent')) return <Navigate to={next} replace />;
    return <Navigate to="/" replace />;
  }
  return <Auth />;
}

export function AdminBrokerFirstEntry({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const { setActiveWorkspace, loading: workspaceLoading } = useWorkspace();
  const [entry, setEntry] = React.useState<{ userId: string; path: string } | null>(null);
  const running = React.useRef<string | null>(null);
  const currentUser = React.useRef(user?.id);
  currentUser.current = user?.id;
  React.useEffect(() => {
    if (entry?.path === '/properties' && location.pathname === '/properties') setEntry({ ...entry, path: '/' });
  }, [location.pathname, entry]);
  React.useEffect(() => {
    if (!user || workspaceLoading || entry?.userId === user.id || running.current === user.id) return;
    const uid = user.id;
    running.current = uid;
    void Promise.resolve(supabase.rpc('complete_admin_broker_first_login')).then(async ({ data, error }) => {
      if (currentUser.current !== uid) return;
      if (!error && data === '/properties') {
        await setActiveWorkspace(user.id);
        writeAppMode('broker', user.id);
      }
      if (currentUser.current === uid) setEntry({ userId: uid, path: !error && data === '/properties' ? '/properties' : '/' });
    }).catch(() => { if (currentUser.current === uid) setEntry({ userId: uid, path: '/' }); }).finally(() => { if (running.current === uid) running.current = null; });
  }, [user?.id, workspaceLoading, setActiveWorkspace, entry?.userId]);
  if (user && (workspaceLoading || entry?.userId !== user.id)) return <PageLoader />;
  if (user && entry?.path === '/properties' && ['/', '/index', '/auth'].includes(location.pathname)) return <Navigate to="/properties" replace />;
  return <>{children}</>;
}

export function EarningsFeedback() { useEarningsFeedback(); return null; }

export function AccountPageLoading({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  // Guests keep their welcome visible; admin section returns never mount a splash.
  return <FullPageLoadingProvider enabled={Boolean(user) && pathname !== '/super-admin'}>{children}</FullPageLoadingProvider>;
}

export function DemoEntry() { React.useEffect(() => { window.location.assign('/demo'); }, []); return <PageLoader />; }
export { ResetPassword };
