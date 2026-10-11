import { HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { tutorialStore, useTutorialState } from '@/lib/tutorials';

/** Restore tutorials hidden with "אל תציג לי את זה יותר". */
export function TutorialSettingsCard() {
  const st = useTutorialState();
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><HelpCircle className="h-4 w-4 text-primary" />מדריכים ועזרה</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">{st.dismissed.length > 0 ? `${st.dismissed.length} מדריכים הוסתרו.` : 'כל המדריכים זמינים דרך סימן השאלה.'}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={st.dismissed.length === 0} onClick={() => { tutorialStore.restoreAll(false); toast.success('המדריכים שוחזרו'); }}>שחזור מדריכים שהוסתרו</Button>
          <Button size="sm" variant="ghost" onClick={() => { tutorialStore.restoreAll(true); toast.success('המדריכים ייפתחו שוב בכניסה לכל עמוד'); }}>הצגה מחדש מההתחלה</Button>
        </div>
      </CardContent>
    </Card>
  );
}
