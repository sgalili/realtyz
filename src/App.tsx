import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { DirectionProvider } from "@radix-ui/react-direction";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { WhiteLabelProvider } from "@/hooks/useWhiteLabel";
import { AppLayout } from "@/components/AppLayout";
import { DemoModeProvider } from "@/hooks/useDemoMode";
import { ElectionTypeProvider } from "@/hooks/useElectionType";
import { MandateProvider } from "@/hooks/useMandate";
import { WorkspaceProvider } from "@/hooks/useWorkspace";
import { ReferralCapture } from '@/components/referrals/ReferralCapture';
import { WorkspaceSelectorModal } from "@/components/workspace/WorkspaceSelectorModal";
import { toast } from "sonner";
import { Suspense } from "react";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { RealtyzLoader } from "@/components/RealtyzLoader";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import { LISTINGS_ENABLED } from "@/config/workspaceMode";

// Lazy load pages for better performance
const Index = lazy(() => import("./pages/Index"));
const LeadCRM = lazy(() => import("./pages/LeadCRM"));
const OmnichannelInbox = lazy(() => import("./pages/OmnichannelInbox"));
const AIContentGenerator = lazy(() => import("./pages/AIContentGenerator"));
const CampaignCenter = lazy(() => import("./pages/CampaignCenter"));
const ActivityLog = lazy(() => import("./pages/ActivityLog"));
const ApiSettings = lazy(() => import("./pages/ApiSettings"));
const Profile = lazy(() => import("./pages/Profile"));
const Billing = lazy(() => import("./pages/Billing"));
const ConnectionSettings = lazy(() => import("./pages/ConnectionSettings"));
const SentimentDashboard = lazy(() => import("./pages/SentimentDashboard"));
const SubscriptionManager = lazy(() => import("./pages/SubscriptionManager"));
const ContactForm = lazy(() => import("./pages/ContactForm"));

const LiveConversations = lazy(() => import("./pages/LiveConversations"));
const LiveActivity = lazy(() => import("./pages/LiveActivity"));
const ConversationAnalytics = lazy(() => import("./pages/ConversationAnalytics"));
const SecurityDashboard = lazy(() => import("./pages/SecurityDashboard"));
const PrivacyDashboard = lazy(() => import("./pages/PrivacyDashboard"));
const MassiveImporter = lazy(() => import("./pages/MassiveImporter"));

const SuperAdmin = lazy(() => import("./pages/SuperAdmin"));
const Finance = lazy(() => import("./pages/Finance"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));
const PublicListingPage = lazy(() => import("./pages/PublicListingPage"));
const ShortLinkRedirect = lazy(() => import("./pages/ShortLinkRedirect"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const SocialConnect = lazy(() => import("./pages/SocialConnect"));
const OAuthCallback = lazy(() => import("./pages/OAuthCallback"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Upgrade = lazy(() => import("./pages/Upgrade"));
const DealRoom = lazy(() => import("./pages/DealRoom"));
const PerformanceInsights = lazy(() => import("./pages/PerformanceInsights"));
const BusinessPerformance = lazy(() => import("./pages/BusinessPerformance"));
const Broadcast = lazy(() => import("./pages/Broadcast"));
const AutomationStudioPage = lazy(() => import("./pages/AutomationStudioPage"));
const Team = lazy(() => import("./pages/Team"));
const SignDocument = lazy(() => import("./pages/SignDocument"));
const Properties = lazy(() => import("./pages/Properties"));
const PropertiesHub = lazy(() => import("./pages/PropertiesHub"));
const PropertyDetail = lazy(() => import("./pages/PropertyDetail"));
const CrmProfile = lazy(() => import("./pages/CrmProfile"));
const WhiteLabelSettings = lazy(() => import("./pages/WhiteLabelSettings"));
const SystemHealth = lazy(() => import("./pages/SystemHealth"));
const SharedDeals = lazy(() => import("./pages/SharedDeals"));
const ClientPortal = lazy(() => import("./pages/ClientPortal"));
const SharedProperty = lazy(() => import("./pages/SharedProperty"));
const PlatformSettings = lazy(() => import("./pages/PlatformSettings"));
const HomelyAdmin = lazy(() => import("./pages/HomelyAdmin"));
const AiDialer = lazy(() => import("./pages/AiDialer"));
const PlatformCredentials = lazy(() => import("./pages/PlatformCredentials"));
const FbEngagement = lazy(() => import("./pages/FbEngagement"));
const CommandCenter = lazy(() => import("./pages/CommandCenter"));
const AffiliateSignup = lazy(() => import("./pages/AffiliateSignup"));
const AffiliatePortal = lazy(() => import("./pages/AffiliatePortal"));
const AffiliateNetwork = lazy(() => import("./pages/AffiliateNetwork"));
const PartnerNetwork = lazy(() => import("./pages/PartnerNetwork"));

const Landing = lazy(() => import("./pages/Landing"));
const Terms = lazy(() => import("./pages/Terms"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));




let syncToastId: string | number | undefined;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      staleTime: 5 * 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
    },
    // Mutations handle their own errors with context-specific messages.
    // No global error toast - it was masking real failures.
  },
});

// Show syncing toast for slow queries
let slowQueryTimer: ReturnType<typeof setTimeout> | undefined;
queryClient.getQueryCache().subscribe((event) => {
  if (event.type === 'updated') {
    const q = event.query;
    if (q.state.fetchStatus === 'fetching') {
      if (!slowQueryTimer) {
        slowQueryTimer = setTimeout(() => {
          syncToastId = toast.loading('מסנכרן נתונים...', { id: 'sync-toast', duration: Infinity });
        }, 3000);
      }
    } else {
      if (slowQueryTimer) { clearTimeout(slowQueryTimer); slowQueryTimer = undefined; }
      if (syncToastId) { toast.dismiss('sync-toast'); syncToastId = undefined; }
    }
  }
});

function PageLoader() {
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
const AFFILIATE_ALLOWED_PATHS = ['/affiliate', '/affiliates', '/profile'];

function ProtectedRoute({ children }: { children: React.ReactNode; allowGuestDemo?: boolean }) {
  const { user, loading } = useAuth();
  const { isAffiliateOnly, loading: roleLoading } = useUserRole();
  const location = useLocation();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <RealtyzLoader size="lg" label="מאמת זהות..." />
    </div>
  );
  if (!user) return <Navigate to="/auth" replace />;

  // Affiliate-only accounts are locked to the affiliate portal.
  if (!roleLoading && isAffiliateOnly) {
    const allowed = AFFILIATE_ALLOWED_PATHS.some(
      (p) => location.pathname === p || location.pathname.startsWith(`${p}/`),
    );
    if (!allowed) return <Navigate to="/affiliate" replace />;
  }

  return <AppLayout><Suspense fallback={<PageLoader />}>{children}</Suspense></AppLayout>;
}

/** Root: guests see the public landing page, signed-in users get the app. */
/** The public marketing domain always opens the landing page at the root. */
const ROOT_MARKETING_HOSTS = new Set(['realtyz.co.il', 'www.realtyz.co.il']);

function RootRoute() {
  const { user, loading } = useAuth();
  const isMarketingHost = typeof window !== 'undefined' &&
    ROOT_MARKETING_HOSTS.has(window.location.hostname.toLowerCase());
  if (isMarketingHost && !user && !loading) return <Navigate to="/landing" replace />;
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <RealtyzLoader size="lg" />
    </div>
  );
  if (!user) return <Suspense fallback={<PageLoader />}><Landing /></Suspense>;
  return <ProtectedRoute><CommandCenter /></ProtectedRoute>;
}


function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  if (loading || roleLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <RealtyzLoader size="lg" label="מאמת הרשאות..." />
    </div>
  );
  if (!user || !isSuperAdmin) return <Navigate to="/" replace />;
  return <AppLayout><Suspense fallback={<PageLoader />}>{children}</Suspense></AppLayout>;
}

function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <RealtyzLoader size="lg" />
    </div>
  );
  if (user) return <Navigate to="/" replace />;
  return <Auth />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <DirectionProvider dir="rtl">
      <TooltipProvider>
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <WorkspaceProvider>
            <WhiteLabelProvider>
            <DemoModeProvider>
            <ElectionTypeProvider>
            <MandateProvider>
            <ReferralCapture />
            <WorkspaceSelectorModal />
            <Routes>
              <Route path="/auth" element={<AuthRoute />} />
              <Route path="/affiliates" element={<Suspense fallback={<PageLoader />}><AffiliateSignup /></Suspense>} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/oauth/callback" element={<Suspense fallback={<PageLoader />}><OAuthCallback /></Suspense>} />
              <Route path="/p/:slug" element={<Suspense fallback={<PageLoader />}><PublicListingPage /></Suspense>} />
              <Route path="/r/:slug" element={<Suspense fallback={<PageLoader />}><ShortLinkRedirect /></Suspense>} />
              <Route path="/portal/:token" element={<Suspense fallback={<PageLoader />}><ClientPortal /></Suspense>} />
              <Route path="/share/property/:token" element={<Suspense fallback={<PageLoader />}><SharedProperty /></Suspense>} />
              <Route path="/ref/:code" element={<Navigate to="/auth" replace />} />
              <Route path="/unsubscribe" element={<Suspense fallback={<PageLoader />}><Unsubscribe /></Suspense>} />
              <Route path="/" element={<RootRoute />} />
              <Route path="/landing" element={<Suspense fallback={<PageLoader />}><Landing /></Suspense>} />
              <Route path="/terms" element={<Suspense fallback={<PageLoader />}><Terms /></Suspense>} />
              <Route path="/privacy-policy" element={<Suspense fallback={<PageLoader />}><PrivacyPolicy /></Suspense>} />

              <Route path="/dashboard" element={<ProtectedRoute allowGuestDemo><Index /></ProtectedRoute>} />
              <Route path="/command-center" element={<ProtectedRoute allowGuestDemo><CommandCenter /></ProtectedRoute>} />
              <Route path="/tasks" element={<Navigate to="/command-center" replace />} />
              <Route path="/crm" element={<ProtectedRoute allowGuestDemo><LeadCRM /></ProtectedRoute>} />
              <Route path="/leads" element={<ProtectedRoute allowGuestDemo><LeadCRM /></ProtectedRoute>} />
              <Route path="/lead-crm" element={<ProtectedRoute allowGuestDemo><LeadCRM /></ProtectedRoute>} />
              <Route path="/lead-crm/:leadId" element={<ProtectedRoute allowGuestDemo><LeadCRM /></ProtectedRoute>} />
              <Route path="/inbox" element={<ProtectedRoute allowGuestDemo><OmnichannelInbox /></ProtectedRoute>} />
              <Route path="/communication" element={<ProtectedRoute allowGuestDemo><OmnichannelInbox /></ProtectedRoute>} />
              <Route path="/deal-room" element={<ProtectedRoute allowGuestDemo><DealRoom /></ProtectedRoute>} />
              {LISTINGS_ENABLED ? (
                <>
                  <Route path="/properties" element={<ProtectedRoute allowGuestDemo><Properties /></ProtectedRoute>} />
                  <Route path="/properties-hub" element={<ProtectedRoute allowGuestDemo><PropertiesHub /></ProtectedRoute>} />
                  <Route path="/properties/:id" element={<ProtectedRoute allowGuestDemo><PropertyDetail /></ProtectedRoute>} />
                </>
              ) : (
                <>
                  <Route path="/properties" element={<Navigate to="/lead-crm" replace />} />
                  <Route path="/properties-hub" element={<Navigate to="/lead-crm" replace />} />
                  <Route path="/properties/:id" element={<Navigate to="/lead-crm" replace />} />
                </>
              )}
              <Route path="/crm/profile/:id" element={<ProtectedRoute><CrmProfile /></ProtectedRoute>} />

              <Route path="/automations" element={<ProtectedRoute allowGuestDemo><AutomationStudioPage /></ProtectedRoute>} />
              <Route path="/insights" element={<ProtectedRoute allowGuestDemo><PerformanceInsights /></ProtectedRoute>} />
              <Route path="/business-performance" element={<ProtectedRoute><BusinessPerformance /></ProtectedRoute>} />
              <Route path="/affiliate" element={<ProtectedRoute><AffiliatePortal /></ProtectedRoute>} />
              <Route path="/affiliate-network" element={<ProtectedRoute><AffiliateNetwork /></ProtectedRoute>} />
              <Route path="/referral" element={<ProtectedRoute><PartnerNetwork /></ProtectedRoute>} />

              <Route path="/ai-content" element={<ProtectedRoute allowGuestDemo><AIContentGenerator /></ProtectedRoute>} />
              <Route path="/ads" element={<Navigate to="/campaigns?tab=campaigns" replace />} />
              <Route path="/campaigns" element={<ProtectedRoute allowGuestDemo><CampaignCenter /></ProtectedRoute>} />
              <Route path="/broadcast" element={<ProtectedRoute><Broadcast /></ProtectedRoute>} />
              <Route path="/campaign-strategy" element={<Navigate to="/campaigns?tab=strategy" replace />} />
              <Route path="/approval-queue" element={<Navigate to="/campaigns?tab=approvals" replace />} />
              <Route path="/activity-log" element={<ProtectedRoute allowGuestDemo><ActivityLog /></ProtectedRoute>} />
              <Route path="/logs" element={<Navigate to="/activity-log" replace />} />
              <Route path="/calendar" element={<Navigate to="/campaigns?tab=calendar" replace />} />
              <Route path="/sentiment" element={<ProtectedRoute allowGuestDemo><SentimentDashboard /></ProtectedRoute>} />
              <Route path="/subscription" element={<ProtectedRoute allowGuestDemo><SubscriptionManager /></ProtectedRoute>} />
              <Route path="/api-settings" element={<ProtectedRoute allowGuestDemo><ApiSettings /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute allowGuestDemo><Profile /></ProtectedRoute>} />
              <Route path="/billing" element={<ProtectedRoute allowGuestDemo><Billing /></ProtectedRoute>} />
              <Route path="/settings/connections" element={<ProtectedRoute allowGuestDemo><ConnectionSettings /></ProtectedRoute>} />
              <Route path="/settings/branding" element={<ProtectedRoute><WhiteLabelSettings /></ProtectedRoute>} />
              <Route path="/settings/white-label" element={<Navigate to="/settings/branding" replace />} />
              <Route path="/settings/system-health" element={<ProtectedRoute><SystemHealth /></ProtectedRoute>} />
              <Route path="/settings/platform" element={<ProtectedRoute><PlatformSettings /></ProtectedRoute>} />
              <Route path="/settings/homely-admin" element={<ProtectedRoute><HomelyAdmin /></ProtectedRoute>} />
              <Route path="/homely-api" element={<Navigate to="/api-settings" replace />} />
              <Route path="/social-connect" element={<ProtectedRoute allowGuestDemo><SocialConnect /></ProtectedRoute>} />
              <Route path="/social/engagement" element={<ProtectedRoute><FbEngagement /></ProtectedRoute>} />
              
             <Route path="/live-conversations" element={<ProtectedRoute allowGuestDemo><LiveConversations /></ProtectedRoute>} />
             <Route path="/ai-dialer" element={<ProtectedRoute><AiDialer /></ProtectedRoute>} />
             <Route path="/settings/credentials" element={<ProtectedRoute><PlatformCredentials /></ProtectedRoute>} />
              <Route path="/live-activity" element={<ProtectedRoute allowGuestDemo><LiveActivity /></ProtectedRoute>} />
              <Route path="/conversation-analytics" element={<ProtectedRoute allowGuestDemo><ConversationAnalytics /></ProtectedRoute>} />
              <Route path="/security" element={<ProtectedRoute allowGuestDemo><SecurityDashboard /></ProtectedRoute>} />
              <Route path="/privacy" element={<ProtectedRoute><PrivacyDashboard /></ProtectedRoute>} />
              <Route path="/massive-import" element={<ProtectedRoute allowGuestDemo><MassiveImporter /></ProtectedRoute>} />
              <Route path="/sms-blast" element={<Navigate to="/campaigns?tab=broadcast" replace />} />
              <Route path="/super-admin" element={<SuperAdminRoute><SuperAdmin /></SuperAdminRoute>} />
              <Route path="/finance" element={<ProtectedRoute allowGuestDemo><Finance /></ProtectedRoute>} />
              <Route path="/knowledge" element={<ProtectedRoute allowGuestDemo><KnowledgeBase /></ProtectedRoute>} />
              <Route path="/strategy-bank" element={<ProtectedRoute allowGuestDemo><KnowledgeBase /></ProtectedRoute>} />
              <Route path="/team" element={<ProtectedRoute><Team /></ProtectedRoute>} />
              <Route path="/shared-deals" element={<ProtectedRoute><SharedDeals /></ProtectedRoute>} />
              <Route path="/sign/:token" element={<Suspense fallback={<PageLoader />}><SignDocument /></Suspense>} />
              <Route path="/upgrade" element={<ProtectedRoute allowGuestDemo><Upgrade /></ProtectedRoute>} />
              <Route path="/pricing" element={<Navigate to="/upgrade" replace />} />
              <Route path="/contact" element={<Suspense fallback={<PageLoader />}><ContactForm /></Suspense>} />
              <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFound /></Suspense>} />
            </Routes>
            </MandateProvider>
            </ElectionTypeProvider>
            </DemoModeProvider>
            </WhiteLabelProvider>
            </WorkspaceProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </DirectionProvider>
  </QueryClientProvider>
);

export default App;
