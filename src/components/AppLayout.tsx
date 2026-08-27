import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import realtyzLogo from '@/assets/realtyz-logo.png';
import { Bot, Zap, X, Smartphone, CheckCircle2, Loader2, QrCode, ShieldAlert, MessageSquareText, Flame, Scale, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useWorkspace } from '@/hooks/useWorkspace';

import { MandateSelector } from '@/components/dashboard/MandateSelector';
import { MagicMandateSelector } from '@/components/dashboard/MagicMandateSelector';

import { RotatingHeadline } from '@/components/RotatingHeadline';

import NotificationCenter from '@/components/NotificationCenter';
import AiAgentDrawer from '@/components/AiAgentDrawer';
import QuickActionDrawer from '@/components/QuickActionDrawer';
import ProductTour from '@/components/tour/ProductTour';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { RealtyzOnboardingWizard } from '@/components/RealtyzOnboardingWizard';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DEMO_AUTH_REQUIRED_EVENT, DEMO_EXIT_PENDING_KEY, DEMO_UPGRADE_EVENT } from '@/lib/demoGuard';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useElectionType } from '@/hooks/useElectionType';
import { LiveActivityFeed } from '@/components/dashboard/LiveActivityFeed';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { DEMO_CANDIDATES, getDemoCandidateCrisisAlerts, type DemoCandidateId } from '@/lib/demoData';
import { TrialQuickStartWizard } from '@/components/TrialQuickStartWizard';
import { useTrialStatus } from '@/hooks/useTrialStatus';
import { friendlyUserDisplayName } from '@/lib/friendlyUserDisplayName';

// DemoModeToggle removed from app
import { PageHero } from '@/components/PageHero';
import { FacebookConnectionBanner } from '@/components/social/FacebookConnectionBanner';

const DEMO_ARCHETYPES: DemoCandidateId[] = ['primary-single', 'primary-slate', 'national-small', 'national-mid', 'national-large'];
const TUTORIAL_STEPS = [
  { path: '/dashboard', title: 'לוח הבקרה', text: 'כאן רואים את תמונת הניצחון: תומכים מאומתים, יעד עסקאות וקמפיינים שמתקדמים בזמן אמת.' },
  { path: '/sentiment', title: 'ניתוח סנטימנט', text: 'כאן מזהים איפה המסר מנצח, איפה יש התנגדות, ומה דורש תגובה חדה ומהירה.' },
  { path: '/calendar', title: 'יומן תוכן', text: 'כאן מתזמנים מהלכים, מטפטפים מסרים ושומרים על קצב קמפיין מנצח.' },
];


function HeaderProfileLink() {
  const { user } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) { setAvatarUrl(null); return; }
    supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => setAvatarUrl((data as any)?.avatar_url ?? null));
  }, [user?.id]);

  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, any>;
  const displayName = friendlyUserDisplayName(user, 'ללא שם');
  const initial = displayName.slice(0, 1);

  return (
    <Link to="/profile" aria-label="מעבר לפרופיל" className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-visible rounded-full bg-primary text-xs font-bold text-primary-foreground ring-1 ring-border transition hover:opacity-90">
      <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full">
        {avatarUrl ? <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" /> : initial}
      </span>
    </Link>
  );
}

function HeaderCrisisAlert() {
  const { user } = useAuth();
  const { isDemoMode, demoCandidateId } = useDemoMode();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [demoCounterOpen, setDemoCounterOpen] = useState(false);

  const { data: crisisAlerts } = useQuery({
    queryKey: ['header-crisis-alerts', user?.id],
    enabled: !!user?.id && !isDemoMode,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('crisis_alerts')
        .select('*')
        .eq('user_id', user!.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1);
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const activeCrisisAlerts = isDemoMode ? getDemoCandidateCrisisAlerts(demoCandidateId) : crisisAlerts ?? [];
  const alert = activeCrisisAlerts[0];
  if (!alert) return null;

  const demoBotComments: Array<{
    text: string;
    explanation: string;
    href: string;
    actions: Array<{ label: string; href: string; variant?: 'default' | 'secondary' | 'destructive' | 'outline' }>;
  }> = [
    {
      text: 'אותו טקסט מועתק מ-12 חשבונות חדשים',
      explanation: 'זוהתה פעילות מתואמת: 12 חשבונות שנפתחו ב-72 השעות האחרונות מפרסמים את אותו טקסט מילה במילה. סימן מובהק לקמפיין בוטים.',
      href: '/sentiment?filter=coordinated',
      actions: [
        { label: 'הצג חשבונות', href: '/sentiment?filter=coordinated', variant: 'outline' },
        { label: 'דווח לפלטפורמה', href: '/sentiment?action=report_coordinated', variant: 'destructive' },
        { label: 'חסום אוטומטית', href: '/sentiment?action=block_coordinated', variant: 'default' },
      ],
    },
    {
      text: 'קישור חשוד חוזר בתגובות',
      explanation: 'אותו קישור קצר מופץ ב-37 תגובות בשעה האחרונה. מוביל לדומיין שאינו מזוהה והוא חשוד כפישינג או כדיסאינפורמציה.',
      href: '/approval?filter=suspicious_link',
      actions: [
        { label: 'בדוק קישור', href: '/approval?filter=suspicious_link', variant: 'outline' },
        { label: 'הסר תגובות', href: '/approval?action=remove_links', variant: 'destructive' },
        { label: 'פרסם הבהרה', href: '/approval?action=publish_clarification', variant: 'default' },
      ],
    },
    {
      text: 'תגובה אגרסיבית ללא פרטים או הקשר',
      explanation: 'משתמש פרסם תגובה תוקפנית ללא הקשר עובדתי. מומלץ לפנות בשיחה אישית לפני שהשיח מתלהט.',
      href: '/inbox?lead=demo-lead-1',
      actions: [
        { label: 'פתח בשיחה', href: '/inbox?lead=demo-lead-1', variant: 'outline' },
        { label: 'שלח תגובה ממלכתית', href: '/inbox?lead=demo-lead-1&template=statesman', variant: 'default' },
        { label: 'התעלם וסמן', href: '/inbox?lead=demo-lead-1&action=ignore', variant: 'secondary' },
      ],
    },
  ];

  const handleAct = (href: string) => {
    setOpen(false);
    navigate(href);
  };

  const handleActAll = () => {
    setOpen(false);
    toast.success('הופעל מענה אוטומטי לכל האזהרות');
    navigate('/sentiment?action=handle_all');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="פתח התראת משבר"
          aria-expanded={open}
            className="relative h-9 w-9 border-0 bg-transparent p-0 text-destructive shadow-none hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/40"
        >
          <ShieldAlert className="h-5 w-5" />
          <span className="absolute right-0 top-0 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            1
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={10}
        className="w-[min(92vw,720px)] overflow-hidden rounded-md border border-destructive/25 bg-card p-0 text-card-foreground shadow-xl"
        dir="rtl"
      >
        <div className="space-y-4 p-4 text-right sm:p-5">
          <div className="space-y-1.5">
            <p className="text-lg font-bold text-destructive">{alert.title}</p>
            <p className="text-sm text-muted-foreground">{alert.summary}</p>
            <p className="text-xs text-muted-foreground">נושא: {alert.affected_topic || 'כללי'} · קהל: {alert.affected_segment || 'שיח ציבורי'}</p>
          </div>

          {isDemoMode && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-muted-foreground">אזהרות פעילות ({demoBotComments.length})</p>
                <Button size="sm" variant="default" onClick={handleActAll} className="h-7 text-[11px]">
                  <ShieldAlert className="h-3.5 w-3.5" /> טפל בכולן
                </Button>
              </div>
              <div className="space-y-2">
                {demoBotComments.map((c) => (
                  <details key={c.text} className="group rounded-md border border-border bg-muted/40 p-4 text-base">
                    <summary className="flex cursor-pointer items-center gap-3 list-none">
                      <Bot className="h-6 w-6 shrink-0 text-destructive" />
                      <span className="flex-1 font-semibold text-base">{c.text}</span>
                      <span className="text-xs text-muted-foreground group-open:hidden">הצג פרטים ←</span>
                      <span className="hidden text-xs text-muted-foreground group-open:inline">סגור ↑</span>
                    </summary>
                    <div className="mt-3 space-y-3 border-t border-border/50 pt-3">
                      <p className="text-sm leading-relaxed text-muted-foreground">{c.explanation}</p>
                      <div className="flex flex-wrap gap-2">
                        {c.actions.map((a) => (
                          <Button
                            key={a.label}
                            size="sm"
                            variant={a.variant ?? 'outline'}
                            className="h-9 text-xs"
                            onClick={() => handleAct(a.href)}
                          >
                            {a.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function HeaderCrisisOption({ icon: Icon, title, text }: { icon: typeof Flame; title: string; text?: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3 text-right">
      <p className="flex items-center gap-1.5 text-xs font-bold"><Icon className="h-3.5 w-3.5 text-destructive" /> {title}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{text || 'ממתין להמלצת AI'}</p>
    </div>
  );
}

const DEMO_PEEK_KEY = 'realtyz-demo-sidebar-peeked';

function DemoSidebarPeek() {
  // Auto-open behavior intentionally disabled per product decision:
  // the sidebar must never open on its own when entering a page.
  return null;
}


export function AppLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { settings: brand } = useWhiteLabel();
  const { activeWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const { isDemoMode, setDemoMode, demoCandidateId, setDemoCandidateId } = useDemoMode();
  useSessionTimeout();
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [trialWizardOpen, setTrialWizardOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [quickConnectOpen, setQuickConnectOpen] = useState(false);
  const { isTrial } = useTrialStatus();
  const [candidatePickerOpen, setCandidatePickerOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  const [whatsappInstanceId, setWhatsappInstanceId] = useState('');
  const [whatsappToken, setWhatsappToken] = useState('');
  const [connectingWhatsApp, setConnectingWhatsApp] = useState(false);

  // Auto-launch onboarding for new users
  const { data: onboarding } = useQuery({
    queryKey: ['onboarding-state', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('onboarding_state')
        .select('completed_at')
        .eq('user_id', user!.id)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (localStorage.getItem(DEMO_EXIT_PENDING_KEY) === 'true' || quickConnectOpen) return;
    // Never auto-open the onboarding wizard on the subscription page — it
    // hides the entire calculator and creates the "narrow strip" complaint.
    if (location.pathname.startsWith('/subscription')) return;
    if (!user) return;

    // Admin override — force the trial wizard for QA/testing.
    if (localStorage.getItem(`realtyz-force-trial-wizard-${user.id}`) === '1') {
      setTrialWizardOpen(true);
      return;
    }

    if (onboarding !== undefined && !onboarding?.completed_at) {
      const dismissed = localStorage.getItem(`realtyz-onboarding-dismissed-${user.id}`);
      if (dismissed) return;
      // Trial users get the new 4-step Quick-Start; everyone else gets the legacy strategy wizard.
      if (isTrial) setTrialWizardOpen(true);
      else setWizardOpen(true);
    }
  }, [user, onboarding, quickConnectOpen, location.pathname, isTrial]);

  useEffect(() => {
    const handler = () => setWizardOpen(true);
    const trialHandler = () => setTrialWizardOpen(true);
    window.addEventListener('open-onboarding-wizard', handler);
    window.addEventListener('open-trial-wizard', trialHandler);
    return () => {
      window.removeEventListener('open-onboarding-wizard', handler);
      window.removeEventListener('open-trial-wizard', trialHandler);
    };
  }, []);

  useEffect(() => {
    const handler = () => setUpgradeOpen(true);
    const authHandler = () => navigate('/auth');
    window.addEventListener(DEMO_UPGRADE_EVENT, handler);
    window.addEventListener(DEMO_AUTH_REQUIRED_EVENT, authHandler);
    return () => {
      window.removeEventListener(DEMO_UPGRADE_EVENT, handler);
      window.removeEventListener(DEMO_AUTH_REQUIRED_EVENT, authHandler);
    };
  }, [navigate]);

  useEffect(() => {
    if (!user || localStorage.getItem(DEMO_EXIT_PENDING_KEY) !== 'true') return;
    localStorage.removeItem(DEMO_EXIT_PENDING_KEY);
    navigate('/dashboard', { replace: true });
  }, [navigate, user]);

  const connectWhatsApp = async () => {
    if (!user?.id) return;
    if (!whatsappInstanceId.trim() || !whatsappToken.trim()) {
      toast.error('יש למלא Instance ID ו-API Token');
      return;
    }
    setConnectingWhatsApp(true);
    const payload = {
      platform: 'whatsapp_green',
      display_name: 'Primary WhatsApp',
      credentials: { instance_id: whatsappInstanceId.trim(), token: whatsappToken.trim() },
      is_connected: true,
      created_by: user.id,
      last_test_status: 'success',
      last_test_message: 'Connected during fast onboarding',
      last_test_at: new Date().toISOString(),
    };
    const { data: existing } = await supabase
      .from('social_connections')
      .select('id')
      .eq('created_by', user.id)
      .eq('platform', 'whatsapp_green')
      .maybeSingle();
    const { error } = existing?.id
      ? await supabase.from('social_connections').update(payload).eq('id', existing.id)
      : await supabase.from('social_connections').insert(payload);
    setConnectingWhatsApp(false);
    if (error) {
      toast.error('חיבור WhatsApp נכשל');
      return;
    }
    toast.success('WhatsApp חובר ל-AI - המערכת מוכנה לפעולה');
    setQuickConnectOpen(false);
    navigate('/dashboard', { replace: true });
  };

  useEffect(() => {
    if (isDemoMode) return;
    queryClient.prefetchQuery({
      queryKey: ['executive-summary'],
      queryFn: async () => {
        const { supabase } = await import('@/integrations/supabase/client');
        const { data } = await supabase.functions.invoke('executive-summary');
        return data;
      },
      staleTime: 60_000,
    });
    queryClient.prefetchInfiniteQuery({
      queryKey: ['leads-infinite', '', 'all', 'all', 'all'],
      queryFn: async () => {
        const { supabase } = await import('@/integrations/supabase/client');
        const { data, count } = await supabase.from('leads').select('*', { count: 'exact' })
          .order('created_at', { ascending: false }).range(0, 49);
        return { rows: data ?? [], total: count ?? 0, page: 0 };
      },
      initialPageParam: 0,
      staleTime: 5 * 60 * 1000,
    });
  }, [queryClient, isDemoMode]);

  useEffect(() => {
    // Skip the transaction-selector popup on entering demo. Auto-pick a sensible
    // default listing so demo data loads immediately.
    if (isDemoMode && !demoCandidateId) {
      setDemoCandidateId('national-mid');
    }
  }, [isDemoMode, demoCandidateId, setDemoCandidateId]);

  useEffect(() => {
    if (new URLSearchParams(location.search).get('demo') === 'true' && !isDemoMode) setDemoMode(true);
  }, [isDemoMode, location.search, setDemoMode]);

  useEffect(() => {
    if (!isDemoMode) return;
    const key = 'realtyz-demo-session-id';
    let sessionId = window.localStorage.getItem(key);
    if (!sessionId || sessionId.length < 16) {
      sessionId = `demo-${crypto.randomUUID()}`;
      window.localStorage.setItem(key, sessionId);
    }
    const candidate = DEMO_CANDIDATES.find((item) => item.id === demoCandidateId);
    const route = `${location.pathname}${location.search}`.slice(0, 200);
    void (supabase as any).from('demo_sessions').upsert({
      session_id: sessionId,
      current_route: route,
      archetype: candidate?.name ?? null,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent,
      last_seen_at: new Date().toISOString(),
      metadata: { demo: true },
    }, { onConflict: 'session_id' });
  }, [demoCandidateId, isDemoMode, location.pathname, location.search]);

  const chooseDemoCandidate = (candidateId: DemoCandidateId) => {
    setDemoCandidateId(candidateId);
    setCandidatePickerOpen(false);
    navigate('/dashboard');
    
  };

  const activeTutorialStep = tutorialStep === null ? null : TUTORIAL_STEPS[tutorialStep];
  const headerLogo = brand?.landscape_logo_url || brand?.logo_url || activeWorkspace?.workspace_logo_url || '';
  const headerName = brand?.agency_name || activeWorkspace?.workspace_name || 'Realtyz AI';
  const advanceTutorial = () => {
    if (tutorialStep === null) return;
    const nextStep = tutorialStep + 1;
    if (nextStep >= TUTORIAL_STEPS.length) {
      setTutorialStep(null);
      toast.success('הסיור הושלם. עכשיו אפשר לנהל קמפיין חד, מדיד ומנצח.');
      return;
    }
    setTutorialStep(nextStep);
    navigate(TUTORIAL_STEPS[nextStep].path);
  };

  return (
    <SidebarProvider>
      <div className="realtyz-app-shell h-screen overflow-hidden flex w-full bg-background">
        <AppSidebar tutorialHighlightPath={activeTutorialStep?.path} />
        <div className="flex-1 flex h-screen min-w-0 flex-col overflow-hidden">
          <header className="h-16 border-b border-border bg-background text-foreground flex items-center px-4 gap-2 shrink-0 sticky top-0 z-30 relative" dir="rtl">
            {/* Profile avatar on visual right (RTL start) — bell sits right next to it */}
            <div className="flex items-center gap-2">
              <HeaderProfileLink />
              <NotificationCenter />
            </div>

            <div className="flex-1" />

            {/* Centered active workspace brand */}
            <Link
              to="/"
              aria-label={`${headerName} - דף הבית`}
              className="absolute left-1/2 top-1/2 inline-flex max-w-[48vw] -translate-x-1/2 -translate-y-1/2 items-center gap-2 overflow-hidden text-center"
            >
              {headerLogo ? (
                <>
                  <img src={headerLogo} alt={headerName} className="h-10 max-w-[160px] object-contain" />
                  <span className="truncate text-sm font-bold text-foreground">{headerName}</span>
                </>
              ) : (
                <img src={realtyzLogo} alt="Realtyz AI" className="h-11 max-w-[190px] object-contain" />
              )}
            </Link>

            {/* Action buttons on visual left (RTL end) */}
            <div className="flex items-center gap-1.5">
              <HeaderCrisisAlert />
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => window.dispatchEvent(new Event('open-ai-drawer'))}
                aria-label="פתח עוזר AI"
              >
                <Bot className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 p-0 text-primary hover:bg-primary/10 hover:text-primary"
                onClick={() => window.dispatchEvent(new Event('open-quick-actions'))}
                aria-label="פעולות מהירות"
                title="פעולות מהירות"
              >
                <Zap className="h-5 w-5" />
              </Button>

            </div>
          </header>
          <PageHero />
          <main className="realtyz-main-surface flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-6 pb-6 pt-0">
            <FacebookConnectionBanner />
            {children}
            <DemoSidebarPeek />
          </main>
          <AiAgentDrawer />
          <QuickActionDrawer />
          <ProductTour />
          <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
            <DialogContent dir="rtl" className="premium-auth-modal sm:max-w-md">
              <DialogHeader className="text-right">
                <DialogTitle>רוצה להתחיל באמת?</DialogTitle>
                <DialogDescription>
                  במצב הדגמה ניתן לצפות ביכולות, אך שליחה וניהול נתונים אמיתיים דורשים חשבון אישי. הצטרף עכשיו בחינם והתחל לנצח.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:justify-start">
                <Button onClick={() => navigate('/auth')} className="w-full bg-primary text-primary-foreground hover:bg-primary-glow sm:w-auto">הרשמה עכשיו</Button>
                <Button variant="outline" onClick={() => setUpgradeOpen(false)} className="w-full sm:w-auto">המשך בדמו</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <MagicMandateSelector
            open={candidatePickerOpen}
            onComplete={() => {
              setCandidatePickerOpen(false);
              navigate('/dashboard');
            }}
          />
          <Dialog open={quickConnectOpen} onOpenChange={setQuickConnectOpen}>
            <DialogContent dir="rtl" className="premium-auth-modal sm:max-w-lg">
              <DialogHeader className="text-right">
                <DialogTitle className="flex items-center gap-2 text-primary"><Smartphone className="h-5 w-5" /> חבר את ה-WhatsApp (WBA) שלך ל-AI</DialogTitle>
                <DialogDescription>
                  שלב אחרון: סרוק את ה-QR ב-WBA, הזן Instance ID ו-API Token, והמערכת תהיה מבצעית תוך פחות מדקה.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="rounded-lg border border-primary/15 bg-secondary p-4 text-center shadow-inner">
                  <div className="mx-auto mb-3 grid h-32 w-32 place-items-center rounded-md bg-background text-primary shadow-inner">
                    <QrCode className="h-20 w-20" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">פתח WBA → WhatsApp → QR וסרוק מהטלפון</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="quick-wa-instance">Instance ID</Label>
                  <Input id="quick-wa-instance" dir="ltr" value={whatsappInstanceId} onChange={(e) => setWhatsappInstanceId(e.target.value)} placeholder="1101820000" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="quick-wa-token">API Token</Label>
                  <Input id="quick-wa-token" dir="ltr" type="password" value={whatsappToken} onChange={(e) => setWhatsappToken(e.target.value)} placeholder="••••••••" />
                </div>
              </div>
              <DialogFooter className="gap-2 sm:justify-start">
                <Button onClick={connectWhatsApp} disabled={connectingWhatsApp} className="w-full bg-primary text-primary-foreground hover:bg-primary-glow sm:w-auto">
                  {connectingWhatsApp ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  אמת וחבר
                </Button>
                <Button variant="outline" onClick={() => { setQuickConnectOpen(false); navigate('/dashboard', { replace: true }); }} className="w-full sm:w-auto">דלג עכשיו</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {/* Onboarding wizards permanently disabled per product decision */}
        </div>
        
      </div>
    </SidebarProvider>
  );
}
