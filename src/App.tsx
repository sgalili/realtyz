import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { DirectionProvider } from "@radix-ui/react-direction";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { AppLayout } from "@/components/AppLayout";
import { DemoModeProvider, useDemoMode } from "@/hooks/useDemoMode";
import { ElectionTypeProvider } from "@/hooks/useElectionType";
import { MandateProvider } from "@/hooks/useMandate";
import { toast } from "sonner";
import { lazy, Suspense } from "react";
import { KalpizLoader } from "@/components/KalpizLoader";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";

// Lazy load pages for better performance
const Index = lazy(() => import("./pages/Index"));
const LeadCRM = lazy(() => import("./pages/LeadCRM"));
const OmnichannelInbox = lazy(() => import("./pages/OmnichannelInbox"));
const AIContentGenerator = lazy(() => import("./pages/AIContentGenerator"));
const CampaignCenter = lazy(() => import("./pages/CampaignCenter"));
const ActivityLog = lazy(() => import("./pages/ActivityLog"));
const ApiSettings = lazy(() => import("./pages/ApiSettings"));
const SentimentDashboard = lazy(() => import("./pages/SentimentDashboard"));
const SubscriptionManager = lazy(() => import("./pages/SubscriptionManager"));
const ContactForm = lazy(() => import("./pages/ContactForm"));
const AdminLeads = lazy(() => import("./pages/AdminLeads"));
const LiveConversations = lazy(() => import("./pages/LiveConversations"));
const LiveActivity = lazy(() => import("./pages/LiveActivity"));
const ConversationAnalytics = lazy(() => import("./pages/ConversationAnalytics"));
const SecurityDashboard = lazy(() => import("./pages/SecurityDashboard"));
const MassiveImporter = lazy(() => import("./pages/MassiveImporter"));

const SuperAdmin = lazy(() => import("./pages/SuperAdmin"));
const Finance = lazy(() => import("./pages/Finance"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));
const PublicListingPage = lazy(() => import("./pages/PublicListingPage"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const SocialConnect = lazy(() => import("./pages/SocialConnect"));
const OAuthCallback = lazy(() => import("./pages/OAuthCallback"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Upgrade = lazy(() => import("./pages/Upgrade"));


let syncToastId: string | number | undefined;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      staleTime: 30_000,
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
      <KalpizLoader size="lg" label="טוען..." />
    </div>
  );
}

function ProtectedRoute({ children, allowGuestDemo = false }: { children: React.ReactNode; allowGuestDemo?: boolean }) {
  const { user, loading } = useAuth();
  const { isDemoMode } = useDemoMode();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <KalpizLoader size="lg" label="מאמת זהות..." />
    </div>
  );
  if (!user && (!isDemoMode || !allowGuestDemo)) return <Navigate to="/auth" replace />;
  return <AppLayout><Suspense fallback={<PageLoader />}>{children}</Suspense></AppLayout>;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isDemoMode } = useDemoMode();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  if (loading || roleLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <KalpizLoader size="lg" label="מאמת הרשאות..." />
    </div>
  );
  if (isDemoMode || !user || !isSuperAdmin) return <Navigate to="/" replace />;
  return <AppLayout><Suspense fallback={<PageLoader />}>{children}</Suspense></AppLayout>;
}

function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <KalpizLoader size="lg" />
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
            <DemoModeProvider>
            <ElectionTypeProvider>
            <MandateProvider>
            <Routes>
              <Route path="/auth" element={<AuthRoute />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/oauth/callback" element={<Suspense fallback={<PageLoader />}><OAuthCallback /></Suspense>} />
              <Route path="/p/:slug" element={<Suspense fallback={<PageLoader />}><PublicListingPage /></Suspense>} />
              <Route path="/unsubscribe" element={<Suspense fallback={<PageLoader />}><Unsubscribe /></Suspense>} />
              <Route path="/" element={<ProtectedRoute allowGuestDemo><Index /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute allowGuestDemo><Index /></ProtectedRoute>} />
              <Route path="/crm" element={<ProtectedRoute allowGuestDemo><LeadCRM /></ProtectedRoute>} />
              <Route path="/leads" element={<ProtectedRoute allowGuestDemo><LeadCRM /></ProtectedRoute>} />
              <Route path="/lead-crm" element={<ProtectedRoute allowGuestDemo><LeadCRM /></ProtectedRoute>} />
              <Route path="/inbox" element={<ProtectedRoute allowGuestDemo><OmnichannelInbox /></ProtectedRoute>} />
              <Route path="/ai-content" element={<ProtectedRoute allowGuestDemo><AIContentGenerator /></ProtectedRoute>} />
              <Route path="/ads" element={<Navigate to="/campaigns?tab=campaigns" replace />} />
              <Route path="/campaigns" element={<ProtectedRoute allowGuestDemo><CampaignCenter /></ProtectedRoute>} />
              <Route path="/campaign-strategy" element={<Navigate to="/campaigns?tab=strategy" replace />} />
              <Route path="/approval-queue" element={<Navigate to="/campaigns?tab=approvals" replace />} />
              <Route path="/activity-log" element={<ProtectedRoute allowGuestDemo><ActivityLog /></ProtectedRoute>} />
              <Route path="/calendar" element={<Navigate to="/campaigns?tab=calendar" replace />} />
              <Route path="/sentiment" element={<ProtectedRoute allowGuestDemo><SentimentDashboard /></ProtectedRoute>} />
              <Route path="/subscription" element={<ProtectedRoute allowGuestDemo><SubscriptionManager /></ProtectedRoute>} />
              <Route path="/api-settings" element={<ProtectedRoute allowGuestDemo><ApiSettings /></ProtectedRoute>} />
              <Route path="/homely-api" element={<ProtectedRoute><HomelyApiSettings /></ProtectedRoute>} />
              <Route path="/social-connect" element={<ProtectedRoute allowGuestDemo><SocialConnect /></ProtectedRoute>} />
              <Route path="/leads" element={<ProtectedRoute allowGuestDemo><AdminLeads /></ProtectedRoute>} />
              <Route path="/live-conversations" element={<ProtectedRoute allowGuestDemo><LiveConversations /></ProtectedRoute>} />
              <Route path="/live-activity" element={<ProtectedRoute allowGuestDemo><LiveActivity /></ProtectedRoute>} />
              <Route path="/conversation-analytics" element={<ProtectedRoute allowGuestDemo><ConversationAnalytics /></ProtectedRoute>} />
              <Route path="/security" element={<ProtectedRoute allowGuestDemo><SecurityDashboard /></ProtectedRoute>} />
              <Route path="/massive-import" element={<ProtectedRoute allowGuestDemo><MassiveImporter /></ProtectedRoute>} />
              <Route path="/sms-blast" element={<Navigate to="/campaigns?tab=broadcast" replace />} />
              <Route path="/super-admin" element={<SuperAdminRoute><SuperAdmin /></SuperAdminRoute>} />
              <Route path="/finance" element={<ProtectedRoute allowGuestDemo><Finance /></ProtectedRoute>} />
              <Route path="/knowledge" element={<ProtectedRoute allowGuestDemo><KnowledgeBase /></ProtectedRoute>} />
              <Route path="/upgrade" element={<ProtectedRoute allowGuestDemo><Upgrade /></ProtectedRoute>} />
              <Route path="/pricing" element={<Navigate to="/upgrade" replace />} />
              <Route path="/contact" element={<Suspense fallback={<PageLoader />}><ContactForm /></Suspense>} />
              <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFound /></Suspense>} />
            </Routes>
            </MandateProvider>
            </ElectionTypeProvider>
            </DemoModeProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </DirectionProvider>
  </QueryClientProvider>
);

export default App;
