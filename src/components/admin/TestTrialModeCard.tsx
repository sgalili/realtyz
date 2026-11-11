import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { FlaskConical, PlayCircle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Admin-only QA card. Lets a logged-in admin force-open the Trial Wizard
 * for their own session without changing their actual plan_status.
 */
export function TestTrialModeCard() {
  const { user } = useAuth();
  const storageKey = user ? `realtyz-force-trial-wizard-${user.id}` : '';
  const dismissedKey = user ? `realtyz-onboarding-dismissed-${user.id}` : '';
  const [forced, setForced] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    setForced(localStorage.getItem(storageKey) === '1');
  }, [storageKey]);

  if (!user) return null;

  const toggleForced = (value: boolean) => {
    if (value) {
      localStorage.setItem(storageKey, '1');
      localStorage.removeItem(dismissedKey);
      setForced(true);
      toast.success('אשף הניסיון יוצג בכניסה הבאה');
    } else {
      localStorage.removeItem(storageKey);
      setForced(false);
      toast.info('מצב בדיקה כובה');
    }
  };

  const launchNow = () => {
    localStorage.removeItem(dismissedKey);
    window.dispatchEvent(new CustomEvent('open-trial-wizard'));
    toast.success('אשף הניסיון נפתח');
  };

  const resetWizardState = () => {
    localStorage.removeItem(dismissedKey);
    localStorage.removeItem(`trial-wizard-state-${user.id}`);
    toast.success('מצב האשף אופס ויופיע מחדש בכניסה הבאה');
  };

  return (
    <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4 text-amber-500" />
          מצב ניסיון לבדיקה
          <Badge variant="outline" className="border-amber-500/40 text-amber-600">
            בדיקות
          </Badge>
        </CardTitle>
        <CardDescription>
          הפעלת אשף תקופת הניסיון עבור החשבון שלך בלבד, ללא שינוי ה-plan_status האמיתי.
          שימושי לבדיקת תהליך ההצטרפות ומגבלת 100 הרשומות.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/60 p-3">
          <div>
            <div className="text-sm font-semibold">פתיחה אוטומטית של האשף</div>
            <div className="text-xs text-muted-foreground">
              כל כניסה לדשבורד תפתח את אשף הניסיון, עד שתכבה את המתג.
            </div>
          </div>
          <Switch checked={forced} onCheckedChange={toggleForced} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={launchNow} className="gap-1.5">
            <PlayCircle className="h-4 w-4" />
            פתיחת האשף עכשיו
          </Button>
          <Button size="sm" variant="outline" onClick={resetWizardState} className="gap-1.5">
            <RotateCcw className="h-4 w-4" />
            איפוס מצב האשף
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          טיפ: למעבר אמיתי למסלול ניסיון לצורך בדיקת מגבלת 100 הרשומות, יש לעדכן
          את ה-<code>plan_status</code> בטבלת <code>profiles</code> ל-<code>'trial'</code>.
        </p>
      </CardContent>
    </Card>
  );
}
