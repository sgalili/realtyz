import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChartNoAxesCombined, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { useMySubmissions } from '@/hooks/useAffiliate';
import { supabase } from '@/integrations/supabase/client';
import { fmtILS } from '@/lib/formatCurrency';
import { useUserRole } from '@/hooks/useUserRole';
import { useAppMode } from '@/hooks/useAppMode';
import { cn } from '@/lib/utils';

const AffiliateNetwork = lazy(() => import('@/pages/AffiliateNetwork'));
const MyAds = lazy(() => import('@/pages/MyAds'));
const LeadCRM = lazy(() => import('@/pages/LeadCRM'));

/** Header icon (next to the notification bell) that opens the personal activity drawer. */
export default function HomeActivityPill() {
  const { user } = useAuth();
  const owner = useActiveWorkspaceOwnerId();
  const { isAffiliateOnly } = useUserRole();
  const { isPartnerMode } = useAppMode();
  const partnerView = isAffiliateOnly || isPartnerMode;
  const [open, setOpen] = useState(false);
  const [activity, setActivity] = useState('properties');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headerAnchor = triggerRef.current?.closest('header') ?? undefined;
  useEffect(() => { setOpen(false); setActivity('properties'); }, [user?.id, owner]);
  const submissions = useMySubmissions();
  const personal = useQuery({
    queryKey: ['home-personal-activity', user?.id, owner],
    enabled: !!user && !!owner,
    queryFn: async () => {
      const [ads, leads] = await Promise.all([
        supabase.rpc('get_my_ads_stats'),
        supabase.from('leads').select('id', { head: true, count: 'exact' }).eq('workspace_owner_id', owner ?? '').eq('is_demo', false),
      ]);
      if (ads.error) throw ads.error;
      if (leads.error) throw leads.error;
      return { properties: new Set((ads.data ?? []).filter(row => row.relation === 'owned').map(row => row.listing_id)).size, leads: leads.count ?? 0 };
    },
  });
  if (!user) return null;
  const metrics = {
    properties: personal.data?.properties ?? 0,
    leads: (personal.data?.leads ?? 0) + (submissions.data?.length ?? 0),
    earnings: submissions.data?.reduce((sum, row) => sum + Number(row.earned_amount ?? 0), 0) ?? 0,
  };
  const tabs = [
    { id: 'properties', label: <>{metrics.properties} הנכסים שלי</> },
    { id: 'leads', label: <>{metrics.leads} לידים בשיווק</> },
    { id: 'earnings', label: <>הרווחים</> },
  ];
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button ref={triggerRef} variant="ghost" size="icon" className={cn('h-9 w-9', open && 'bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive')} aria-label="הפעילות שלי" title="הפעילות שלי">
      <ChartNoAxesCombined className="h-5 w-5" />
    </Button></PopoverTrigger>
    <PopoverContent portalContainer={headerAnchor} side="bottom" align="start" className="home-activity-drawer p-0" aria-label="הפעילות שלי" dir="rtl">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="font-semibold">הפעילות שלי</h2>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="סגירת הפעילות" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
      </div>
      <Tabs value={activity} onValueChange={setActivity}>
        <TabsList className="grid h-auto w-full grid-cols-3 rounded-none bg-background p-1">
          {tabs.map(t => <TabsTrigger key={t.id} value={t.id} className="min-w-0 whitespace-normal px-1 py-3 text-sm">{t.label}</TabsTrigger>)}
        </TabsList>
        <div className="max-h-[calc(100dvh-12rem)] overflow-x-hidden overflow-y-auto overscroll-contain border-t px-3">
          <Suspense fallback={<p role="status" className="py-8 text-center text-sm text-muted-foreground">טוען פעילות…</p>}>
            <TabsContent value="properties"><MyAds /></TabsContent>
            <TabsContent value="leads">{partnerView ? <AffiliateNetwork activityOnly initialTab="mine" /> : <LeadCRM />}</TabsContent>
            <TabsContent value="earnings">
              {submissions.isSuccess && <p className="py-4 text-xl font-semibold">{fmtILS(metrics.earnings)}</p>}
              {partnerView ? <AffiliateNetwork activityOnly initialTab="earnings" /> : <div className="divide-y">
                {submissions.isError ? <p role="alert" className="py-8 text-center text-destructive">לא ניתן לטעון את הרווחים כרגע</p> : !submissions.isSuccess ? <p role="status" className="py-8 text-center">טוען רווחים…</p> : submissions.data.length ? submissions.data.map(row => <div key={row.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="min-w-0 break-words">{row.listing?.property_title || row.lead_name}</span><bdi className="shrink-0">{fmtILS(Number(row.earned_amount ?? 0))}</bdi></div>) : <p className="py-8 text-center text-muted-foreground">עדיין אין רווחים</p>}
              </div>}
            </TabsContent>
          </Suspense>
        </div>
      </Tabs>
    </PopoverContent>
  </Popover>;
}
