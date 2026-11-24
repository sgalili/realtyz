import { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const MyAds = lazy(() => import('./MyAds'));
const CampaignCenter = lazy(() => import('./CampaignCenter'));

type HubTab = 'ads' | 'campaigns';

/** Brokers-only hub: the existing My Ads and Campaigns screens side by side under one entry. */
export default function PublishingHub() {
  const [params, setParams] = useSearchParams();
  const tab: HubTab = params.get('tab') === 'campaigns' ? 'campaigns' : 'ads';
  return (
    <div dir="rtl" className="space-y-3">
      <div className="mx-auto flex w-full max-w-md justify-center px-3 pt-3">
        <Tabs value={tab} onValueChange={(v) => setParams((p) => { p.set('tab', v); return p; }, { replace: true })} className="w-full">
          <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl">
            <TabsTrigger value="ads" className="whitespace-nowrap font-semibold">המודעות שלי</TabsTrigger>
            <TabsTrigger value="campaigns" className="whitespace-nowrap font-semibold">קמפיינים והפצה</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <Suspense fallback={null}>{tab === 'ads' ? <MyAds /> : <CampaignCenter />}</Suspense>
    </div>
  );
}
