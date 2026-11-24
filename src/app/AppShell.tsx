/**
 * The application provider tree, moved from the former src/App.tsx. The
 * <Routes> block became <Outlet />; every provider, global host and the
 * view-only demo runtime keep their original nesting order.
 */
import * as React from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Outlet, useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Suspense } from 'react';
import { DirectionProvider } from '@radix-ui/react-direction';
import { PlatformMetadata } from '@/components/PlatformMetadata';
import { PublicWorkspaceProvider, InitialDemoWorkspaceChoice, publicWorkspaceRoute } from '@/components/demo/PublicWorkspaceProvider';
import { installPublicWorkspaceTransport } from '@/lib/publicWorkspaceTransport';
import { BrokerDemoRouteGate } from '@/components/demo/BrokerDemoRouteGate';
import { InventoryComingSoonHost } from '@/components/InventoryCollection';
import { CreditRateSync } from '@/hooks/useCreditRate';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/hooks/useAuth';
import { DemoViewBar } from '@/components/demo/DemoViewBar';
import { PersonalLanguageProvider } from '@/i18n/personalLanguage';
import { WhiteLabelProvider } from '@/hooks/useWhiteLabel';
import { PendingMessageResume } from '@/components/community/SendProfileMessage';
import { SocialDraftChargeDialog } from '@/components/campaigns/SocialDraftChargeDialog';
import { InactiveYad2ImportDialog } from '@/components/properties/InactiveYad2ImportDialog';
import { AppFooter } from '@/components/AppFooter';
import { FaqHost } from '@/components/faq/FaqDialog';
import { DemoModeProvider } from '@/hooks/useDemoMode';
import { ElectionTypeProvider } from '@/hooks/useElectionType';
import { MandateProvider } from '@/hooks/useMandate';
import { WorkspaceProvider } from '@/hooks/useWorkspace';
import { ReferralCapture } from '@/components/referrals/ReferralCapture';
import { WorkspaceSelectorModal } from '@/components/workspace/WorkspaceSelectorModal';
import { RouteScrollRestoration } from '@/components/navigation/RouteScrollRestoration';
import { FullPageLoading as RealtyzLoader } from '@/components/ui/full-page-loading';
import { CreditsUpgradeDialog } from '@/components/billing/CreditsUpgradeDialog';
import type { PlatformMode } from '@/hooks/usePlatformMode';
import { PostSignupWelcome } from '@/components/onboarding/PostSignupWelcome';
import { ImportedLicenseGate } from '@/components/onboarding/ImportedLicenseGate';
import { AccessibilityEffects } from '@/components/accessibility/AccessibilityEffects';
import { PageLoader, AdminBrokerFirstEntry, WorkspaceScope, AccountPageLoading, EarningsFeedback } from '@/app/AppRoutes';
import { BootGate } from '@/app/BootGate';

/** Shows the syncing toast while any query has been fetching for over 3 seconds. */
function useSlowQueryToast(queryClient: QueryClient) {
  React.useEffect(() => {
    let slowQueryTimer: ReturnType<typeof setTimeout> | undefined;
    let syncToastId: string | number | undefined;
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') return;
      if (event.query.state.fetchStatus === 'fetching') {
        if (!slowQueryTimer) {
          slowQueryTimer = setTimeout(() => {
            syncToastId = toast.loading('מסנכרן נתונים...', { id: 'sync-toast', duration: Infinity });
          }, 3000);
        }
      } else {
        if (slowQueryTimer) { clearTimeout(slowQueryTimer); slowQueryTimer = undefined; }
        if (syncToastId) { toast.dismiss('sync-toast'); syncToastId = undefined; }
      }
    });
    return () => { unsubscribe(); if (slowQueryTimer) clearTimeout(slowQueryTimer); };
  }, [queryClient]);
}

// The only live read permitted before the isolated demo mounts is this public, two-field
// setting. Bound before the demo transport can replace window.fetch.
const demoSettingsFetch: typeof fetch | undefined = typeof window !== 'undefined' ? window.fetch.bind(window) : undefined;

export function AppShell({ queryClient }: { queryClient: QueryClient }) {
  return <BootGate><AppTree queryClient={queryClient} /></BootGate>;
}

function AppTree({ queryClient }: { queryClient: QueryClient }) {
  const router = useRouter();
  useSlowQueryToast(queryClient);
  const [route, setRoute] = React.useState(() => publicWorkspaceRoute(window.location.pathname));
  const [demoPlatformMode, setDemoPlatformMode] = React.useState<PlatformMode | null>(null);
  React.useEffect(() => {
    if (!route || demoPlatformMode) return;
    let alive = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    void (demoSettingsFetch ?? window.fetch)(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/get_public_platform_settings`, {
      method: 'POST', headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: '{}', signal: controller.signal,
    }).then(async response => { if (!response.ok) throw new Error('mode_unavailable'); const rows = await response.json(); return rows?.[0]?.platform_mode === 'full_marketplace' ? 'full_marketplace' as const : 'brokers_only' as const; })
      .catch(() => 'brokers_only' as const).then(mode => { if (alive) setDemoPlatformMode(mode); })
      .finally(() => window.clearTimeout(timeout));
    return () => { alive = false; controller.abort(); window.clearTimeout(timeout); };
  }, [route?.base, demoPlatformMode]);
  React.useEffect(() => {
    const sync = () => setRoute(previous => { const next = publicWorkspaceRoute(window.location.pathname); return next?.base === previous?.base ? previous : next; });
    // Demo role switches write the address bar directly; let the router re-read it.
    const roleSwitch = () => { sync(); router.history.replace(`${window.location.pathname}${window.location.search}${window.location.hash}`); };
    window.addEventListener('toraff:public-demo-role', roleSwitch); window.addEventListener('popstate', sync);
    return () => { window.removeEventListener('toraff:public-demo-role', roleSwitch); window.removeEventListener('popstate', sync); };
  }, [router]);
  const previousRuntime = React.useRef<ReturnType<typeof installPublicWorkspaceTransport> | null>(null);
  const runtime = React.useMemo(() => { previousRuntime.current?.restore(); const next = route ? installPublicWorkspaceTransport(route.role, demoPlatformMode ?? 'brokers_only') : null; previousRuntime.current = next; return next; }, [route?.base, demoPlatformMode]);
  const cache = React.useMemo(() => runtime ? new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 1000 } } }) : queryClient, [runtime, queryClient]);
  React.useEffect(() => () => { runtime?.restore(); if (runtime) cache.clear(); }, [runtime, cache]);
  if (route && !demoPlatformMode) return <div className="flex min-h-screen items-center justify-center"><RealtyzLoader size="lg" /></div>;
  return <PublicWorkspaceProvider key={route?.base ?? 'registered'} store={runtime?.store ?? null}><QueryClientProvider client={cache}>
    <CreditRateSync>
    <DirectionProvider dir="rtl">
      <TooltipProvider>
          <HelmetProvider>
          <PlatformMetadata />
          <AccessibilityEffects />
          <RouteScrollRestoration />
          <AuthProvider>
          <AccountPageLoading>
          <PersonalLanguageProvider>
          <EarningsFeedback />
          <Sonner />
            <WorkspaceProvider>
            <WhiteLabelProvider>
            <DemoModeProvider>
            <CreditsUpgradeDialog />
            <ElectionTypeProvider>
            <MandateProvider>
            <Suspense fallback={<PageLoader />}>
            <DemoViewBar />
            <ReferralCapture />
            <WorkspaceSelectorModal />
            <InitialDemoWorkspaceChoice enabled={route?.choose ?? false} />
            <PostSignupWelcome />
            <AdminBrokerFirstEntry><ImportedLicenseGate><WorkspaceScope>
            <div className="app-route-pages">
            <PendingMessageResume />
            <BrokerDemoRouteGate><Outlet /></BrokerDemoRouteGate>
            </div>
            </WorkspaceScope></ImportedLicenseGate></AdminBrokerFirstEntry>
            </Suspense>
            <AppFooter />
            <FaqHost />
            <SocialDraftChargeDialog />
            <InactiveYad2ImportDialog />
            <InventoryComingSoonHost />
            </MandateProvider>
            </ElectionTypeProvider>
            </DemoModeProvider>
            </WhiteLabelProvider>
            </WorkspaceProvider>
          </PersonalLanguageProvider>
          </AccountPageLoading>
           </AuthProvider>
          </HelmetProvider>
      </TooltipProvider>
    </DirectionProvider>
    </CreditRateSync>
  </QueryClientProvider></PublicWorkspaceProvider>;
}
