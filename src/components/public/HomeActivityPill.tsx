import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChartNoAxesCombined } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { useMyReferrals, useMySubmissions } from '@/hooks/useAffiliate';
import { supabase } from '@/integrations/supabase/client';
import { hasHomeActivity } from '@/lib/homeActivity';
import { fmtILS } from '@/lib/formatCurrency';
import { useUserRole } from '@/hooks/useUserRole';
import { useAppMode } from '@/hooks/useAppMode';
import { cn } from '@/lib/utils';

const AffiliateNetwork = lazy(() => import('@/pages/AffiliateNetwork'));

/** Header icon (next to the notification bell) that opens the personal activity drawer. */
export default function HomeActivityPill() {
  const { user } = useAuth();
  const owner = useActiveWorkspaceOwnerId();
  const navigate = useNavigate();
  const { isAffiliateOnly } = useUserRole();
  const { isPartnerMode } = useAppMode();
  const partnerView = isAffiliateOnly || isPartnerMode;
  const [open, setOpen] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const referrals = useMyReferrals();
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
  if (!user || !personal.isSuccess || !referrals.isSuccess || !submissions.isSuccess) return null;
  const metrics = {
    ...personal.data,
    leads: personal.data.leads + submissions.data.length,
    marketing: new Set(referrals.data.filter(row => row.listing_id && !['cancelled', 'lost'].includes(row.status)).map(row => row.listing_id)).size,
    earnings: submissions.data.reduce((sum, row) => sum + Number(row.earned_amount ?? 0), 0),
  };
  if (!hasHomeActivity(metrics)) return null;
  const go = (path: string) => { setOpen(false); navigate(path); };
  const pick = (tab: string) => {
    if (tab === 'properties') return go('/my-ads');
    if (!partnerView) return go(tab === 'leads' ? '/lead-crm' : '/wallet');
    setActivity(tab === 'leads' ? 'mine' : tab);
  };
  const tabs = [
    { id: 'properties', label: <>{metrics.properties} נכסים שלי</> },
    { id: 'leads', label: <>{metrics.leads} לידים בשיווק</> },
    { id: 'earnings', label: <><bdi dir="ltr">{fmtILS(metrics.earnings)}</bdi> רווחים</> },
  ];
  return <>
    <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="הפעילות שלי" title="הפעילות שלי" onClick={() => { setOpen(true); setActivity(null); }}>
      <ChartNoAxesCombined className="h-5 w-5" />
    </Button>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" dir="rtl" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader><SheetTitle className="text-right">הפעילות שלי</SheetTitle></SheetHeader>
        <div role="tablist" className="mt-4 flex flex-wrap gap-1 border-b pb-3">
          {tabs.map(t => <Button key={t.id} role="tab" aria-selected={activity === (t.id === 'leads' ? 'mine' : t.id)} variant="ghost" size="sm" className={cn(activity === (t.id === 'leads' ? 'mine' : t.id) && 'bg-muted')} onClick={() => pick(t.id)}>{t.label}</Button>)}
        </div>
        {activity && <Suspense fallback={<p className="mt-4 text-sm text-muted-foreground">טוען פעילות…</p>}><AffiliateNetwork key={activity} activityOnly initialTab={activity} /></Suspense>}
      </SheetContent>
    </Sheet>
  </>;
}
