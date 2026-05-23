import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RealtyzLoader } from '@/components/RealtyzLoader';
import { RealtyzWave } from '@/components/RealtyzWave';
import { Crosshair, Megaphone, Calendar, ShieldCheck, Radio, ClipboardList, Send, Users, ArrowRight } from 'lucide-react';
import { useElectionType } from '@/hooks/useElectionType';
import { supabase } from '@/integrations/supabase/client';

const CampaignStrategy = lazy(() => import('./CampaignStrategy'));
const CampaignManager = lazy(() => import('./CampaignManager'));
const ContentCalendar = lazy(() => import('./ContentCalendar'));
const ApprovalQueue = lazy(() => import('./ApprovalQueue'));
const SmsBlastSimulator = lazy(() => import('./SmsBlastSimulator'));
const DeliveryReports = lazy(() => import('./DeliveryReports'));
const CommunityBroadcastPanel = lazy(() => import('@/components/CommunityBroadcastPanel'));

type TabValue = 'strategy' | 'campaigns' | 'calendar' | 'approvals' | 'broadcast';
type BroadcastSubTab = 'community' | 'send' | 'reports';



const PageFallback = () => (
  <div className="min-h-[40vh] flex items-center justify-center">
    <RealtyzLoader size="md" label="טוען..." />
  </div>
);

const CampaignCenter = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { terms } = useElectionType();
  const TABS = [
    { value: 'strategy' as const,  label: 'אסטרטגיה',     icon: Crosshair,     description: `מטרות, ${terms.seats} ומסרים מרכזיים` },
    { value: 'campaigns' as const, label: 'קמפיינים',     icon: Megaphone,     description: 'Meta Ads, קישורי מעקב וקמפיינים פעילים' },
    { value: 'calendar' as const,  label: 'יומן תוכן',    icon: Calendar,      description: 'תזמון פרסומים והעלאת קבצים' },
    { value: 'approvals' as const, label: 'אישורים',      icon: ShieldCheck,   description: 'תוכן AI שממתין לאישור אנושי' },
    { value: 'broadcast' as const, label: 'הפצת הודעות',  icon: Radio,         description: `WhatsApp, SMS ואימייל ל${terms.audience} - כולל דו"חות מסירה` },
  ];
  const initialSub = (searchParams.get('sub') as BroadcastSubTab) ?? 'community';
  const activeSub: BroadcastSubTab = (['community', 'send', 'reports'] as BroadcastSubTab[]).includes(initialSub)
    ? initialSub
    : 'community';
  const initial = (searchParams.get('tab') as TabValue) ?? 'strategy';
  const active: TabValue = TABS.some((t) => t.value === initial) ? initial : 'strategy';
  const activeMeta = TABS.find((t) => t.value === active)!;

  const handleChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    if (value !== 'broadcast') next.delete('sub');
    setSearchParams(next, { replace: true });
  };

  const handleSubChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'broadcast');
    next.set('sub', value);
    setSearchParams(next, { replace: true });
  };

  // Lead-context hero: when launching the composer from a specific lead's CRM
  // profile, the URL carries ?lead=<id>&name=<full name>&from=crm (legacy
  // value 'voter-crm' is treated identically).
  const navigate = useNavigate();
  const leadId = searchParams.get('lead') ?? searchParams.get('voter');
  const leadName = searchParams.get('name');
  const fromRaw = searchParams.get('from');
  const fromCrm = fromRaw === 'crm' || fromRaw === 'voter-crm';

  // Pull the lead's avatar/full name so the Hero shows a true profile chip.
  const [leadAvatar, setLeadAvatar] = useState<string | null>(null);
  const [leadFullName, setLeadFullName] = useState<string | null>(null);
  useEffect(() => {
    if (!leadId) { setLeadAvatar(null); setLeadFullName(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('leads')
        .select('full_name, profile_picture_url')
        .eq('id', leadId)
        .maybeSingle();
      if (cancelled) return;
      setLeadAvatar((data as any)?.profile_picture_url ?? null);
      setLeadFullName((data as any)?.full_name ?? null);
    })();
    return () => { cancelled = true; };
  }, [leadId]);
  const displayName = leadFullName ?? leadName ?? '';
  const initials = displayName
    .split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || '?';

  return (
    <div className="space-y-6" dir="rtl">
      {leadId && displayName ? (
        <div
          className="relative -mx-6 -mt-6 mb-2 overflow-hidden text-primary-foreground"
          style={{ backgroundColor: '#0096E6' }}
          data-no-hero-wave
        >
          <div className="relative z-10 grid items-center px-4 sm:px-6" style={{ minHeight: '88px', gridTemplateColumns: '1fr auto 1fr' }}>
            {/* RIGHT edge: back arrow (RTL: visually rightmost column comes first in grid) */}
            <div className="flex justify-start">
              {fromCrm && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate(`/lead-crm?lead=${encodeURIComponent(leadId)}`)}
                  className="text-primary-foreground hover:bg-primary-foreground/10"
                  aria-label="חזרה לפרופיל המתעניין"
                >
                  <ArrowRight className="h-5 w-5" />
                </Button>
              )}
            </div>
            {/* CENTER: avatar + name on the same flexline */}
            <div className="flex items-center justify-center gap-3">
              <Avatar className="h-10 w-10 ring-2 ring-primary-foreground/40 shrink-0">
                {leadAvatar ? <AvatarImage src={leadAvatar} alt={displayName} /> : null}
                <AvatarFallback className="bg-primary-foreground/15 text-primary-foreground text-sm font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight whitespace-nowrap">
                {displayName}
              </h1>
            </div>
            <div />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6">
            <RealtyzWave position="bottom" variant="wave-soft" fill="#f1f5f9" seed={7} />
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm text-muted-foreground mt-1">{activeMeta.description}</p>
        </div>
      )}

      <Tabs value={active} onValueChange={handleChange} className="w-full">
        <div className="sticky top-0 z-30 -mx-6 px-6 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/60">
          <TabsList className="grid w-full grid-cols-5 h-auto gap-1 bg-transparent p-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex flex-col items-center justify-center gap-1 py-2 px-1 text-[11px] sm:text-xs bg-background border border-border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-sm"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="leading-none">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent value="strategy" className="mt-6">
          <Suspense fallback={<PageFallback />}><CampaignStrategy /></Suspense>
        </TabsContent>
        <TabsContent value="campaigns" className="mt-6">
          <Suspense fallback={<PageFallback />}><CampaignManager /></Suspense>
        </TabsContent>
        <TabsContent value="calendar" className="mt-6">
          <Suspense fallback={<PageFallback />}><ContentCalendar /></Suspense>
        </TabsContent>
        <TabsContent value="approvals" className="mt-6">
          <Suspense fallback={<PageFallback />}><ApprovalQueue /></Suspense>
        </TabsContent>
        <TabsContent value="broadcast" className="mt-6">
          <Tabs value={activeSub} onValueChange={handleSubChange} className="w-full" dir="rtl">
            <TabsList className="grid w-full max-w-2xl grid-cols-3 h-auto gap-1 bg-muted/50 p-1">
              <TabsTrigger value="community" className="flex items-center justify-center gap-2 py-2 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Users className="h-4 w-4 shrink-0" />
                <span>עדכון לקהילה</span>
              </TabsTrigger>
              <TabsTrigger value="send" className="flex items-center justify-center gap-2 py-2 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Send className="h-4 w-4 shrink-0" />
                <span>שיגור הודעות</span>
              </TabsTrigger>
              <TabsTrigger value="reports" className="flex items-center justify-center gap-2 py-2 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <ClipboardList className="h-4 w-4 shrink-0" />
                <span>דו"חות מסירה</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="community" className="mt-6">
              <Suspense fallback={<PageFallback />}><CommunityBroadcastPanel /></Suspense>
            </TabsContent>
            <TabsContent value="send" className="mt-6">
              <Suspense fallback={<PageFallback />}><SmsBlastSimulator /></Suspense>
            </TabsContent>
            <TabsContent value="reports" className="mt-6">
              <Suspense fallback={<PageFallback />}><DeliveryReports /></Suspense>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CampaignCenter;
