// חבילות שותפים — dedicated pricing page. Prices are displayed and the choice
// is persisted; no billing is performed.
import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AFFILIATE_PLANS, affiliateAnnualPrice, type AffiliatePlanSlug } from '@/lib/affiliatePlans';
import { TouchCreditsExplainerBody } from '@/components/billing/TouchCreditsExplainer';
import { useAffiliatePreferences } from '@/hooks/useAffiliate';

export default function AffiliatePricing() {
  const { preferences } = useAffiliatePreferences();
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const [selected, setSelected] = useState<AffiliatePlanSlug>('free');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBilling(preferences.billing_period);
    if (AFFILIATE_PLANS.some((plan) => plan.slug === preferences.plan_slug)) {
      setSelected(preferences.plan_slug as AffiliatePlanSlug);
    }
  }, [preferences.billing_period, preferences.plan_slug]);

  const save = async (slug: AffiliatePlanSlug) => {
    setSaving(true);
    const { data, error } = await supabase.rpc('select_my_affiliate_plan', { _plan_slug: slug, _billing_period: billing });
    setSaving(false);
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      toast.error('שמירת החבילה נכשלה');
      return;
    }
    setSelected(slug);
    toast.success('בחירת החבילה נשמרה');
  };

  return (
    <div dir="rtl" className="space-y-5 p-4">
      <section className="space-y-4">
        <div className="flex justify-center">
          <div className="inline-flex rounded-md border p-1">
            <Button size="sm" variant={billing === 'monthly' ? 'default' : 'ghost'} onClick={() => setBilling('monthly')}>חודשי</Button>
            <Button size="sm" variant={billing === 'annual' ? 'default' : 'ghost'} onClick={() => setBilling('annual')}>שנתי</Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {AFFILIATE_PLANS.map((plan) => {
            const price = billing === 'annual' ? affiliateAnnualPrice(plan.monthlyPrice) : plan.monthlyPrice;
            return (
              <Card key={plan.slug} className={plan.highlight ? 'border-primary' : undefined}>
                <CardContent className="space-y-3 p-4">
                  <div>
                    <p className="flex items-baseline gap-1">
                      <span className="text-2xl font-black">₪{price.toLocaleString('he-IL')}</span>
                      <span className="text-xs font-semibold text-muted-foreground">{billing === 'annual' ? '/לשנה' : '/לחודש'}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">עד {plan.contacts.toLocaleString('he-IL')} אנשי קשר</p>
                  </div>
                  <Button className="w-full" variant={selected === plan.slug ? 'secondary' : 'default'} disabled={saving} onClick={() => void save(plan.slug)}>
                    {selected === plan.slug ? 'נבחרה' : 'בחירת חבילה'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <Card>
        <CardContent className="p-4">
          <TouchCreditsExplainerBody />
        </CardContent>
      </Card>
    </div>
  );
}
