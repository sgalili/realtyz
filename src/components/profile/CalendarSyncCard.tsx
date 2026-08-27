import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDays } from 'lucide-react';
import { GoogleServiceConnectCard } from '@/components/profile/GoogleServiceConnectCard';

/**
 * Google Calendar sync — every tour, meeting and time-based task created in
 * Realtyz is pushed to the connected Google Calendar.
 */
export function CalendarSyncCard() {
  return (
    <Card dir="rtl" className="text-right">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-right">
          <CalendarDays className="h-5 w-5 text-primary" />
          <span>יומן Google</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <GoogleServiceConnectCard
          platform="google_calendar"
          title="סנכרון יומן מלא"
          hint="חבר את יומן Google שלך — כל סיור, פגישה ותזכורת שנקבעים ב-Realtyz יסונכרנו אוטומטית ליומן."
        />
        <ul className="list-inside list-disc space-y-1 text-[13px] text-muted-foreground">
          <li>סיורי נכסים ופגישות נוצרים ביומן עם כתובת הנכס ופרטי הלקוח.</li>
          <li>שינוי או ביטול ב-Realtyz מתעדכן גם ביומן.</li>
          <li>ה-AI רואה את הזמנים הפנויים שלך לפני שהוא מציע מועד ללקוח.</li>
        </ul>
      </CardContent>
    </Card>
  );
}

export default CalendarSyncCard;
