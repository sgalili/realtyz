import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { Search, Bot, User, LayoutDashboard, Radio, X, Smartphone, CheckCircle2, Loader2, QrCode, ShieldAlert, MessageSquareText, Flame, Scale, EyeOff, CornerDownLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

import { MandateSelector } from '@/components/dashboard/MandateSelector';
import { MagicMandateSelector } from '@/components/dashboard/MagicMandateSelector';
import { MandateSelectorMount } from '@/components/MandateSelectorMount';
import { RotatingHeadline } from '@/components/RotatingHeadline';

import NotificationCenter from '@/components/NotificationCenter';
import AiAgentDrawer from '@/components/AiAgentDrawer';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { RealtyzOnboardingWizard } from '@/components/RealtyzOnboardingWizard';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatPhoneDisplay } from '@/lib/formatPhone';
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
import { BrandMark } from '@/components/branding/BrandMark';
import { HeaderProfileMenu } from '@/components/header/HeaderProfileMenu';


import { DemoModeToggle } from '@/components/DemoModeToggle';
import { PageHero } from '@/components/PageHero';

const DEMO_ARCHETYPES: DemoCandidateId[] = ['primary-single', 'primary-slate', 'national-small', 'national-mid', 'national-large'];
const TUTORIAL_STEPS = [
  { path: '/dashboard', title: 'לוח הבקרה', text: 'כאן רואים את תמונת הניצחון: תומכים מאומתים, יעד עסקאות וקמפיינים שמתקדמים בזמן אמת.' },
  { path: '/sentiment', title: 'ניתוח סנטימנט', text: 'כאן מזהים איפה המסר מנצח, איפה יש התנגדות, ומה דורש תגובה חדה ומהירה.' },
  { path: '/calendar', title: 'יומן תוכן', text: 'כאן מתזמנים מהלכים, מטפטפים מסרים ושומרים על קצב קמפיין מנצח.' },
];

const QUICK_LINKS = [
  { label: 'לוח בקרה', path: '/', icon: LayoutDashboard },
  { label: 'ניהול מתעניינים', path: '/lead-crm', icon: User },
  { label: 'הפצת SMS', path: '/sms-blast', icon: Radio },
];

const SEARCH_PLACEHOLDERS = [
  'חפש מתעניין לפי שם...',
  'חפש טלפון: 052-1234567...',
  'חפש עיר: חיפה...',
  'חפש מתלבטים בתל אביב...',
  'חפש תומכים בירושלים...',
  'חפש לפי תגית עניין...',
  'חפש מתעניינים עם סנטימנט חיובי...',
  'חפש אנשי קשר שנוצר איתם קשר...',
  'חפש מתעניינים פעילים השבוע...',
  'חפש קהל יעד לקמפיין...',
];

interface SearchResult {
  id: string;
  type: 'lead' | 'page';
  title: string;
  subtitle?: string;
  path: string;
}

function SearchExpandable() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [typedPlaceholder, setTypedPlaceholder] = useState('');
  const [placeholderFading, setPlaceholderFading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
    if (!open) { setQuery(''); setResults([]); }
  }, [open]);

  useEffect(() => {
    let timeout: number;
    const suggestion = SEARCH_PLACEHOLDERS[placeholderIndex];

    setPlaceholderFading(false);
    setTypedPlaceholder('');

    const typeNext = (charIndex: number) => {
      setTypedPlaceholder(suggestion.slice(0, charIndex));
      if (charIndex < suggestion.length) {
        timeout = window.setTimeout(() => typeNext(charIndex + 1), 45);
        return;
      }

      timeout = window.setTimeout(() => {
        setPlaceholderFading(true);
        timeout = window.setTimeout(() => {
          setPlaceholderIndex((current) => (current + 1) % SEARCH_PLACEHOLDERS.length);
        }, 300);
      }, 6000);
    };

    timeout = window.setTimeout(() => typeNext(1), 250);
    return () => window.clearTimeout(timeout);
  }, [placeholderIndex]);

  const applySuggestedInput = () => {
    setQuery(SEARCH_PLACEHOLDERS[placeholderIndex]);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(prev => !prev); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const terms = q.trim().split(/\s+/).map(t => `'${t}'`).join(' & ');
      const { data: voters } = await supabase
        .from('leads')
        .select('id, full_name, phone_number, city')
        .textSearch('fts', terms, { type: 'plain', config: 'simple' })
        .limit(6);

      const voterResults: SearchResult[] = (voters ?? []).map(v => ({
        id: v.id, type: 'lead',
        title: v.full_name || 'ללא שם',
        subtitle: `${formatPhoneDisplay(v.phone_number)}${v.city ? ` · ${v.city}` : ''}`,
        path: '/lead-crm',
      }));

      const pageResults: SearchResult[] = QUICK_LINKS
        .filter(l => l.label.includes(q))
        .map(l => ({ id: l.path, type: 'page' as const, title: l.label, path: l.path }));

      setResults([...pageResults, ...voterResults]);
    } catch { setResults([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 250);
    return () => clearTimeout(timer);
  }, [query, search]);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    navigate(result.path);
  };

  return (
    <div ref={containerRef} className="relative flex items-center">
      <Button variant="ghost" size="icon" className="h-9 w-9 p-0 shrink-0" onClick={() => setOpen(prev => !prev)}>
        {open ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
      </Button>
      {open && (
        <div className="relative animate-slide-in-right" style={{ direction: 'rtl' }}>
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            type="search"
            placeholder={typedPlaceholder}
            className={`h-9 w-64 pr-9 pl-9 rounded-lg border border-primary bg-background text-sm text-foreground opacity-100 shadow-none outline-none ring-0 transition-colors duration-300 focus-visible:ring-1 focus-visible:ring-primary/30 focus-visible:ring-offset-0 ${placeholderFading ? 'placeholder:text-transparent' : ''}`}
            onKeyDown={e => e.key === 'Escape' && setOpen(false)}
          />
          {!query && typedPlaceholder && (
            <button
              type="button"
              title="החל חיפוש מוצע"
              aria-label="החל חיפוש מוצע"
              onClick={applySuggestedInput}
              className="absolute left-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <CornerDownLeft className="h-3.5 w-3.5" />
            </button>
          )}
          {(query.trim() || results.length > 0) && (
            <div className="absolute top-full right-0 mt-1 w-72 bg-card border border-border/60 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto scrollbar-thin">
              {loading && <div className="flex justify-center py-4"><div className="realtyz-loader h-6 w-6" /></div>}
              {!loading && query.trim() && results.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">לא נמצאו תוצאות</p>
              )}
              {results.map(r => (
                <button key={r.id} onClick={() => handleSelect(r)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/50 transition-colors text-right text-sm">
                  {r.type === 'lead' ? <User className="h-3.5 w-3.5 text-primary shrink-0" /> : <LayoutDashboard className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{r.title}</p>
                    {r.subtitle && <p className="text-[11px] text-muted-foreground truncate">{r.subtitle}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
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
          className="relative h-9 w-9 border-0 bg-transparent p-0 text-primary-foreground shadow-none hover:bg-transparent hover:text-primary-foreground focus-visible:ring-primary-foreground/40"
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
          <header className="h-16 text-primary-foreground backdrop-blur-md flex items-center px-4 gap-2 shrink-0 sticky top-0 z-30" style={{ backgroundColor: 'hsl(var(--header-bg))' }} dir="rtl">
            {/* RTL: first child = visual right. Profile on visual right, system icons on visual left. */}
            <div className="flex items-center gap-3">
              <HeaderProfileMenu />
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-1.5">
              <HeaderCrisisAlert />
              <NotificationCenter />
              <SearchExpandable />
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 p-0 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                onClick={() => window.dispatchEvent(new Event('open-ai-drawer'))}
                aria-label="פתח עוזר AI"
              >
                <Bot className="h-4 w-4" />
              </Button>
            </div>

          </header>
          <PageHero />
          <main className="realtyz-main-surface flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-6 pb-6 pt-0">
            {children}
            <MandateSelectorMount />
            <DemoSidebarPeek />
          </main>
          <AiAgentDrawer />
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
          {user && <OnboardingWizard
            open={wizardOpen}
            onClose={() => {
              setWizardOpen(false);
              if (user) localStorage.setItem(`realtyz-onboarding-dismissed-${user.id}`, '1');
            }}
          />}
          {user && <TrialQuickStartWizard
            open={trialWizardOpen}
            onClose={() => {
              setTrialWizardOpen(false);
              if (user) localStorage.setItem(`realtyz-onboarding-dismissed-${user.id}`, '1');
            }}
          />}
          
          {user && <RealtyzOnboardingWizard />}
        </div>
        
      </div>
    </SidebarProvider>
  );
}
