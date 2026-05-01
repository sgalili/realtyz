import { lazy, Suspense } from 'react';
import { RealtyzLoader } from '@/components/RealtyzLoader';

const CommunityBroadcastPanel = lazy(() => import('@/components/CommunityBroadcastPanel'));

export default function Broadcast() {
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
