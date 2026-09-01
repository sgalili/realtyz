import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Rocket } from 'lucide-react';

const db = supabase as any;

interface Growth {
  promo_claimed: number;
  promo_slots: number;
  promo_remaining: number;
  referrals_total: number;
  referrals_converted: number;
  credits_launch_bonus: number;
  credits_referral_reward: number;
  credits_manual: number;
  plan_distribution: Record<string, number>;
}

export function GrowthPromoCard() {
  const { data } = useQuery<Growth | null>({
    queryKey: ['growth-analytics'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('get_growth_analytics');
      if (error) throw error;
      return (data ?? null) as Growth | null;
    },
  });

  if (!data) return null;
  const pct = Math.min(100, Math.round((data.promo_claimed / Math.max(1, data.promo_slots)) * 100));
  const convRate = data.referrals_total
    ? Math.round((data.referrals_converted / data.referrals_total) * 100)
    : 0;

  const stat = (label: string, value: string) => (
    <div className="rounded-lg border border-border bg-muted/40 p-3 text-center">
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Rocket className="h-4 w-4 text-primary" /> מבצע השקה והפניות
        </CardTitle>
        <CardDescription>מעקב חי על 50 מקומות ההשקה, הפניות וקרדיטים שחולקו</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span>מקומות שנתפסו: {data.promo_claimed} / {data.promo_slots}</span>
            <span className="text-muted-foreground">נותרו {data.promo_remaining}</span>
          </div>
          <Progress value={pct} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stat('הפניות סה״כ', String(data.referrals_total))}
          {stat('הפכו למשלמים', String(data.referrals_converted))}
          {stat('שיעור המרה', `${convRate}%`)}
          {stat('קרדיט הפניות', `₪${Math.round(data.credits_referral_reward).toLocaleString('he-IL')}`)}
          {stat('מתנות השקה', `₪${Math.round(data.credits_launch_bonus).toLocaleString('he-IL')}`)}
          {stat('התאמות ידניות', `₪${Math.round(data.credits_manual).toLocaleString('he-IL')}`)}
          {Object.entries(data.plan_distribution || {}).map(([plan, count]) =>
            stat(`חבילת ${plan}`, String(count)),
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default GrowthPromoCard;
