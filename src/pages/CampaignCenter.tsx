import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RealtyzLoader } from '@/components/RealtyzLoader';
import { RealtyzWave } from '@/components/RealtyzWave';
import { Radio, Calendar, ShieldCheck, ClipboardList, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const ContentCalendar = lazy(() => import('./ContentCalendar'));
const ApprovalQueue = lazy(() => import('./ApprovalQueue'));
const SmsBlastSimulator = lazy(() => import('./SmsBlastSimulator'));
const DeliveryReports = lazy(() => import('./DeliveryReports'));

type TabValue = 'broadcast' | 'calendar' | 'approvals' | 'reports';

const PageFallback = () => (
  <div className="min-h-[40vh] flex items-center justify-center">
    <RealtyzLoader size="md" label="טוען..." />
  </div>
);

const TABS: { value: TabValue; label: string; icon: typeof Radio }[] = [
  { value: 'broadcast', label: 'הפצת הודעות', icon: Radio },
  { value: 'calendar',  label: 'יומן תוכן ותזמון', icon: Calendar },
  { value: 'approvals', label: 'אישורים', icon: ShieldCheck },
  { value: 'reports',   label: 'דו"חות מסירה', icon: ClipboardList },
];

const CampaignCenter = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Legacy mappings → broadcast.
  const initial = (searchParams.get('tab') as string) ?? 'broadcast';
  const remapped: TabValue =
    initial === 'campaigns' || initial === 'strategy' || initial === 'send'
      ? 'broadcast'
      : (initial as TabValue);
  const active: TabValue = TABS.some((t) => t.value === remapped) ? remapped : 'broadcast';

  const handleChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    next.delete('sub');
    setSearchParams(next, { replace: true });
  };

  // Lead-context hero: ?lead=<id>&name=<full name>&from=crm (legacy: ?voter, ?client).
  const leadId = searchParams.get('lead') ?? searchParams.get('client') ?? searchParams.get('voter');
  const leadNameParam = searchParams.get('name');
  const fromRaw = searchParams.get('from');
  const fromCrm = fromRaw === 'crm' || fromRaw === 'voter-crm' || fromRaw === 'lead-crm';

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

  const displayName = leadFullName ?? leadNameParam ?? '';
  const initials =
    displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || '?';
  const isTargetedMode = !!leadId && !!displayName;

  return (
    <div className="space-y-6" dir="rtl">
      {isTargetedMode && (
        <div
          className="relative -mx-3 sm:-mx-6 -mt-6 mb-2 overflow-hidden text-primary-foreground"
          style={{ backgroundColor: '#0096E6' }}
          data-no-hero-wave
        >
          <div
            className="relative z-10 grid items-center px-4 sm:px-6"
            style={{ minHeight: '88px', gridTemplateColumns: '1fr auto 1fr' }}
          >
            {/* Visual RIGHT column (RTL flex start): back arrow flush to viewport edge */}
            <div className="flex justify-start">
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  fromCrm
                    ? navigate(`/lead-crm?lead=${encodeURIComponent(leadId!)}`)
                    : navigate('/lead-crm')
                }
                className="text-primary-foreground hover:bg-primary-foreground/10"
                aria-label="חזרה לפרופיל המתעניין"
              >
                <ArrowRight className="h-5 w-5" />
              </Button>
            </div>
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
      )}

      {isTargetedMode ? (
        <Suspense fallback={<PageFallback />}><SmsBlastSimulator /></Suspense>
      ) : (
        <Tabs value={active} onValueChange={handleChange} className="w-full">
          <div className="sticky top-0 z-30 -mx-6 px-6 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/60">
            <TabsList className="grid w-full grid-cols-4 h-auto gap-1 bg-transparent p-1">
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

          <TabsContent value="broadcast" className="mt-6 space-y-6">
            <Suspense fallback={<PageFallback />}><SmsBlastSimulator /></Suspense>
          </TabsContent>
          <TabsContent value="calendar" className="mt-6">
            <Suspense fallback={<PageFallback />}><ContentCalendar /></Suspense>
          </TabsContent>
          <TabsContent value="approvals" className="mt-6">
            <Suspense fallback={<PageFallback />}><ApprovalQueue /></Suspense>
          </TabsContent>
          <TabsContent value="reports" className="mt-6">
            <Suspense fallback={<PageFallback />}><DeliveryReports /></Suspense>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default CampaignCenter;
