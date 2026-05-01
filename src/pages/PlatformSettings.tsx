import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlatformSettings, type PlatformSettings as Settings } from '@/hooks/usePlatformSettings';
import { useUserRole } from '@/hooks/useUserRole';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Settings2, Lock } from 'lucide-react';

type ToggleDef = {
  key: keyof Settings;
  title: string;
  description: string;
};

const GROUPS: { label: string; toggles: ToggleDef[] }[] = [
  {
    label: 'אוטומציה',
    toggles: [
      { key: 'enable_ai_autopilot', title: 'AI Autopilot', description: 'מאפשר ל-AI לשלוח הודעות יוצאות מהתור באופן אוטומטי.' },
      { key: 'enable_auto_followups', title: 'מעקבים אוטומטיים', description: 'הצעות מעקב אוטומטיות ללידים שותקים.' },
      { key: 'enable_pending_extraction', title: 'חילוץ נכסים אוטומטי', description: 'AI מזהה נכסים בהודעות ויוצר טיוטות לאישור.' },
    ],
  },
  {
    label: 'תקשורת ושיתוף',
    toggles: [
      { key: 'enable_community_broadcasts', title: 'שידור לקהילה', description: 'הפעלת מודול שידור פרסונלי למקטעי לידים.' },
      { key: 'enable_client_portal', title: 'פורטל לקוח', description: 'יצירת לינקים שיתופיים מוגנים לעסקה.' },
      { key: 'enable_broker_referrals', title: 'הפניות בין מתווכים', description: 'שליחת הפניות לעסקאות לשותפים.' },
      { key: 'enable_voice_calls', title: 'שיחות AI קוליות', description: 'מענה קולי אוטומטי בזמן שאינך זמין.' },
    ],
  },
  {
    label: 'נכסים ומונטיזציה',
    toggles: [
      { key: 'enable_featured_listings', title: 'נכסים מומלצים / מקודמים', description: 'אפשרות לסמן נכסים כ-Featured / Promoted בקטלוג.' },
    ],
  },
];

export default function PlatformSettingsPage() {
  const { settings, isLoading, update, isUpdating } = usePlatformSettings();
  const { isAdmin, isManagingBroker, isSuperAdmin, loading } = useUserRole();

  if (loading) {
    return (
      <div className="container max-w-3xl py-8 space-y-4" dir="rtl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const canEdit = isAdmin || isManagingBroker || isSuperAdmin;
  if (!canEdit) {
    return <Navigate to="/" replace />;
  }

  const onToggle = async (key: keyof Settings, value: boolean) => {
    try {
      await update({ [key]: value });
      toast.success('ההגדרה עודכנה');
    } catch (e: any) {
      toast.error(e?.message ?? 'שגיאה בעדכון');
    }
  };

  return (
    <div className="container max-w-3xl py-8 space-y-6" dir="rtl">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Settings2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">הגדרות פלטפורמה</h1>
          <p className="text-sm text-muted-foreground mt-1">
            הפעלה וכיבוי של מודולים בפלטפורמה. ההגדרות פרטיות לחשבון שלך, ומוסתרות מלקוחות.
          </p>
        </div>
      </div>

      <Card className="border-dashed">
        <CardContent className="py-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          חשוף רק למנהלי הסוכנות. אינו נראה ללקוחות או למתעניינים.
        </CardContent>
      </Card>

      {GROUPS.map((group) => (
        <Card key={group.label}>
          <CardHeader>
            <CardTitle className="text-base">{group.label}</CardTitle>
            <CardDescription>הגדר אילו יכולות זמינות לסוכנות</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {group.toggles.map((t) => (
              <div key={t.key} className="flex items-start justify-between gap-4 py-2 border-b last:border-0">
                <div className="space-y-1">
                  <Label htmlFor={t.key} className="text-sm font-medium cursor-pointer">
                    {t.title}
                  </Label>
                  <p className="text-xs text-muted-foreground leading-relaxed">{t.description}</p>
                </div>
                <Switch
                  id={t.key}
                  checked={Boolean(settings[t.key])}
                  disabled={isLoading || isUpdating}
                  onCheckedChange={(v) => onToggle(t.key, v)}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
