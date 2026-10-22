import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChartNoAxesCombined } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { useMyReferrals, useMySubmissions } from '@/hooks/useAffiliate';
import { supabase } from '@/integrations/supabase/client';
import { hasHomeActivity } from '@/lib/homeActivity';
import { fmtILS } from '@/lib/formatCurrency';

const AffiliateNetwork = lazy(() => import('@/pages/AffiliateNetwork'));

export default function HomeActivityPill() {
  const { user } = useAuth();
  const owner = useActiveWorkspaceOwnerId();
  const navigate = useNavigate();
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
  return <section className="space-y-3" aria-label="הפעילות שלי">
    <Button variant="outline" size="sm" className="h-8 gap-2 rounded-full text-xs" aria-expanded={open} onClick={() => { setOpen(!open); setActivity(null); }}>
      <ChartNoAxesCombined className="h-3.5 w-3.5" />הפעילות שלי<ChevronDown className="h-3.5 w-3.5" />
    </Button>
    {open && <div className="flex flex-wrap gap-1 border-b pb-3">
      <Button variant="ghost" size="sm" onClick={() => navigate('/my-ads')}>{metrics.properties} נכסים שלי</Button>
      <Button variant="ghost" size="sm" onClick={() => setActivity('leads')}>{metrics.leads} לידים</Button>
      <Button variant="ghost" size="sm" onClick={() => setActivity('mine')}>{metrics.marketing} בשיווק</Button>
      <Button variant="ghost" size="sm" onClick={() => setActivity('earnings')}><bdi dir="ltr">{fmtILS(metrics.earnings)}</bdi> רווחים</Button>
    </div>}
    {open && activity && <Suspense fallback={<p className="text-sm text-muted-foreground">טוען פעילות…</p>}><AffiliateNetwork key={activity} activityOnly initialTab={activity} /></Suspense>}
  </section>;
}