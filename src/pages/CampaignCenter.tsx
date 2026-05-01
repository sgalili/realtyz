import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RealtyzLoader } from '@/components/RealtyzLoader';
import { Crosshair, Megaphone, Calendar, ShieldCheck, Radio, ClipboardList, Send, Users } from 'lucide-react';
import { useElectionType } from '@/hooks/useElectionType';

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

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-primary">מרכז הקמפיינים</h1>
        <p className="text-sm text-muted-foreground mt-1">{activeMeta.description}</p>
      </div>

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
