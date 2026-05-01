import { lazy, Suspense } from 'react';
import { RealtyzLoader } from '@/components/RealtyzLoader';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';
import { Card, CardContent } from '@/components/ui/card';
import { Radio } from 'lucide-react';

const CommunityBroadcastPanel = lazy(() => import('@/components/CommunityBroadcastPanel'));

export default function Broadcast() {
  const { settings, isLoading } = usePlatformSettings();

  if (!isLoading && !settings.enable_community_broadcasts) {
    return (
      <div className="container max-w-2xl py-12" dir="rtl">
        <Card>
          <CardContent className="py-10 flex flex-col items-center text-center gap-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Radio className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">מודול השידור כבוי</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              ניתן להפעיל אותו ב<a href="/settings/platform" className="text-primary underline">הגדרות הפלטפורמה</a>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-primary">שידור לקהילה · Broadcast</h1>
        <p className="text-sm text-muted-foreground mt-1">
          בנה/י סגמנט, נסח/י עדכון מקצועי, וה-AI יכין טיוטה אישית לכל מתעניין. הטיוטות נכנסות לתור Autopilot לאישור או שליחה ידנית — אין שליחות גנריות.
        </p>
      </div>
      <Suspense fallback={<RealtyzLoader />}>
        <CommunityBroadcastPanel />
      </Suspense>
    </div>
  );
}
