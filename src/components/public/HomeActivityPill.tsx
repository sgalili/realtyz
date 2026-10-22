import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ChartNoAxesCombined, Wallet, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { useMySubmissions } from '@/hooks/useAffiliate';
import { fmtILS } from '@/lib/formatCurrency';
import { useCreditWallet } from '@/hooks/useSubscription';
import { fmtCompactCredits, ilsToCredits } from '@/lib/credits';
import { useUserRole } from '@/hooks/useUserRole';
import { useAppMode } from '@/hooks/useAppMode';
import { cn } from '@/lib/utils';

const MyAds = lazy(() => import('@/pages/MyAds'));
const LeadCRM = lazy(() => import('@/pages/LeadCRM'));

/** Header icon (next to the notification bell) that opens the personal activity drawer. */
export default function HomeActivityPill() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const owner = useActiveWorkspaceOwnerId();
  const wallet = useCreditWallet();
  const { isAffiliateOnly } = useUserRole();
  const { isPartnerMode } = useAppMode();
  const partnerView = isAffiliateOnly || isPartnerMode;
  const [open, setOpen] = useState(false);
  const [activity, setActivity] = useState('properties');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headerAnchor = triggerRef.current?.closest('header') ?? undefined;
  useEffect(() => { setOpen(false); setActivity('properties'); }, [user?.id, owner]);
  const submissions = useMySubmissions();
  // Same authorized queries the tab contents use, so counts share the cache.
  const ads = useQuery({
    queryKey: ['my-ads-stats', user?.id, owner], enabled: !!user?.id && !!owner,
    queryFn: async () => { const { data, error } = await supabase.rpc('get_my_ads_stats'); if (error) throw error; return (data ?? []) as { relation: string }[]; },
  });
  const leadCount = useQuery({
    queryKey: ['activity-lead-count', user?.id, owner], enabled: !!user?.id && !!owner && !partnerView,
    queryFn: async () => { const { count, error } = await supabase.from('leads').select('id', { count: 'exact', head: true }).eq('workspace_owner_id', owner!); if (error) throw error; return count ?? 0; },
  });
  if (!user) return null;
  const n = (v: number | undefined) => v === undefined ? '' : ` (${v.toLocaleString('he-IL')})`;
  const tabs = [
    { id: 'properties', label: `הנכסים שלי${n(ads.data?.filter(r => r.relation === 'owned').length)}` },
    { id: 'leads', label: `לידים בשיווק${n(partnerView ? submissions.data?.length : leadCount.data)}` },
    { id: 'earnings', label: `רווחים${n(submissions.data?.filter(r => Number(r.earned_amount ?? 0) > 0).length)}` },
  ];
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button ref={triggerRef} variant="ghost" size="icon" className={cn('-ms-[5px] h-9 w-9 shadow-none hover:bg-transparent focus-visible:ring-0 data-[state=open]:bg-transparent', open && 'text-destructive hover:text-destructive')} aria-label="הפעילות שלי" title="הפעילות שלי">
      <ChartNoAxesCombined className="h-5 w-5" />
    </Button></PopoverTrigger>
    <PopoverContent portalContainer={headerAnchor} side="bottom" align="start" className="home-activity-drawer p-0" aria-label="הפעילות שלי" dir="rtl">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <Button variant="ghost" size="sm" className="h-8 min-w-0 gap-1.5 px-1 text-xs" aria-label="יתרת קרדיטים בארנק" onClick={() => { setOpen(false); navigate('/wallet'); }}><Wallet className="h-4 w-4 shrink-0 text-primary" /><span className="truncate tabular-nums">{wallet.isError ? 'היתרה אינה זמינה' : wallet.isLoading || !wallet.data ? 'טוען יתרה…' : fmtCompactCredits(ilsToCredits(wallet.data.balance), 2)}</span></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="סגירת הפעילות" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
      </div>
      <Tabs value={activity} onValueChange={setActivity} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TabsList className="grid h-auto w-full grid-cols-3 rounded-none bg-background p-1">
          {tabs.map(t => <TabsTrigger key={t.id} value={t.id} className="min-w-0 whitespace-normal rounded-none border-b-2 border-transparent px-1 py-2 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none">{t.label}</TabsTrigger>)}
        </TabsList>
        <div data-activity-scroll className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain border-t px-2 sm:px-3">
          <Suspense fallback={<p role="status" className="py-8 text-center text-sm text-muted-foreground">טוען פעילות…</p>}>
            <TabsContent value="properties" className="mt-0 min-w-0"><MyAds key={`${user.id}:${owner}`} activityOnly /></TabsContent>
            <TabsContent value="leads" className="min-w-0">{partnerView ? <div className="divide-y">{submissions.isError ? <p role="alert" className="py-8 text-center text-destructive">לא ניתן לטעון את הלידים כרגע</p> : !submissions.isSuccess ? <p role="status" className="py-8 text-center">טוען לידים…</p> : submissions.data.length ? submissions.data.map(row => <div key={row.id} className="space-y-1 py-3 text-sm"><p className="font-semibold break-words">{row.lead_name}</p><p className="break-words text-muted-foreground">{row.listing?.property_title}</p></div>) : <p className="py-8 text-center text-muted-foreground">עדיין אין לידים בשיווק</p>}</div> : <LeadCRM key={`${user.id}:${owner}`} activityOnly />}</TabsContent>
            <TabsContent value="earnings">
              <div className="divide-y">
                {submissions.isError ? <p role="alert" className="py-8 text-center text-destructive">לא ניתן לטעון את הרווחים כרגע</p> : !submissions.isSuccess ? <p role="status" className="py-8 text-center">טוען רווחים…</p> : submissions.data.length ? submissions.data.filter(row => Number(row.earned_amount ?? 0) > 0).map(row => <div key={row.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="min-w-0 break-words">{row.listing?.property_title || row.lead_name}</span><bdi className="shrink-0">{fmtILS(Number(row.earned_amount ?? 0))}</bdi></div>) : <p className="py-8 text-center text-muted-foreground">עדיין אין רווחים</p>}
              </div>
            </TabsContent>
          </Suspense>
        </div>
      </Tabs>
    </PopoverContent>
  </Popover>;
}
