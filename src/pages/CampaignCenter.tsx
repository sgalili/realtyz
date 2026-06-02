import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RealtyzLoader } from '@/components/RealtyzLoader';
import { RealtyzWave } from '@/components/RealtyzWave';
import { BrandIcon } from '@/components/BrandIcon';
import { Radio, Calendar, ShieldCheck, ClipboardList, ArrowRight, Plus, Bot, Mail, Phone, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const ContentCalendar = lazy(() => import('./ContentCalendar'));
const ApprovalQueue = lazy(() => import('./ApprovalQueue'));
const SmsBlastSimulator = lazy(() => import('./SmsBlastSimulator'));
const DeliveryReports = lazy(() => import('./DeliveryReports'));

type TabValue = 'create' | 'published' | 'responses' | 'approvals' | 'reports';

const PageFallback = () => (
  <div className="min-h-[40vh] flex items-center justify-center">
    <RealtyzLoader size="md" label="טוען..." />
  </div>
);

const TABS: { value: TabValue; label: string; icon: typeof Radio }[] = [
  { value: 'create',    label: 'צור קמפיין',     icon: Radio },
  { value: 'published', label: 'פורסמו',         icon: Calendar },
  { value: 'responses', label: 'תגובות',         icon: MessageSquare },
  { value: 'approvals', label: 'אישורים',        icon: ShieldCheck },
  { value: 'reports',   label: 'דו"חות מסירה',   icon: ClipboardList },
];

type ChannelCard = {
  id: string;
  label: string;
  price?: string;       // localized price text without currency
  priceUnit?: string;   // e.g. "לדקה" / "לנמען"
  free?: boolean;
  brand?: string;       // BrandIcon name
  icon?: typeof Bot;    // fallback lucide icon
  iconColor?: string;
};

const CHANNEL_CARDS: ChannelCard[] = [
  { id: 'x',         label: 'X',          free: true, brand: 'x' },
  { id: 'instagram', label: 'Instagram',  free: true, brand: 'instagram' },
  { id: 'facebook',  label: 'Facebook',   free: true, brand: 'facebook' },
  { id: 'ai-call',   label: 'שיחת AI',    price: '1.00', priceUnit: 'לדקה',   icon: Bot,   iconColor: 'text-amber-500' },
  { id: 'email',     label: 'אימייל',     price: '0.01', priceUnit: 'לנמען',  icon: Mail,  iconColor: 'text-rose-500' },
  { id: 'ivr',       label: 'IVR',        price: '0.20', priceUnit: 'לדקה',   icon: Phone, iconColor: 'text-purple-500' },
  { id: 'youtube',   label: 'YouTube',    free: true, brand: 'youtube' },
  { id: 'linkedin',  label: 'LinkedIn',   free: true, brand: 'linkedin' },
  { id: 'tiktok',    label: 'TikTok',     free: true, brand: 'tiktok' },
];

const ChannelGrid = () => (
  <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5 shadow-sm">
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      {CHANNEL_CARDS.map((c) => {
        const Icon = c.icon;
        return (
          <button
            key={c.id}
            type="button"
            className="group relative flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-background p-3 text-center transition hover:border-primary/40 hover:shadow-md"
          >
            <span
              aria-hidden
              className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/70 group-hover:text-primary"
            >
              <Plus className="h-4 w-4" />
            </span>
            <span className="flex h-8 w-8 items-center justify-center">
              {c.brand ? (
                <BrandIcon name={c.brand} className="h-7 w-7" />
              ) : Icon ? (
                <Icon className={`h-7 w-7 ${c.iconColor ?? 'text-foreground'}`} />
              ) : null}
            </span>
            <span className="text-sm font-semibold text-foreground leading-tight">{c.label}</span>
            {c.free ? (
              <span className="text-xs font-bold text-primary">חינם</span>
            ) : (
              <>
                <span className="text-sm font-bold text-foreground" dir="ltr">
                  <bdi dir="ltr">₪{c.price}</bdi>
                </span>
                <span className="text-[11px] text-muted-foreground">{c.priceUnit}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  </div>
);

const EmptyState = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
    <p className="text-sm font-semibold text-foreground">{title}</p>
    {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
  </div>
);



const CampaignCenter = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Legacy mappings → create.
  const initial = (searchParams.get('tab') as string) ?? 'create';
  const remapped: TabValue =
    initial === 'campaigns' || initial === 'strategy' || initial === 'send' || initial === 'broadcast'
      ? 'create'
      : initial === 'calendar'
      ? 'published'
      : (initial as TabValue);
  const active: TabValue = TABS.some((t) => t.value === remapped) ? remapped : 'create';

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
            <TabsList className="flex w-full h-auto gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1">
              {TABS.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex-1 min-w-fit whitespace-nowrap px-3 py-2 text-xs sm:text-sm font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="create" className="mt-6 space-y-6">
            <ChannelGrid />
            <Suspense fallback={<PageFallback />}><SmsBlastSimulator /></Suspense>
          </TabsContent>
          <TabsContent value="published" className="mt-6">
            <Suspense fallback={<PageFallback />}><ContentCalendar /></Suspense>
          </TabsContent>
          <TabsContent value="responses" className="mt-6">
            <EmptyState title="תגובות יוצגו כאן" hint="כל התגובות הנכנסות לקמפיינים יופיעו במסך זה." />
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
