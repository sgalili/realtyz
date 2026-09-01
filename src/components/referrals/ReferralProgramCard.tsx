import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Copy, Gift, Share2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useReferralProgram } from '@/hooks/useReferralProgram';
import { referralLink } from '@/lib/referralAttribution';

export function ReferralProgramCard() {
  const { data, isLoading } = useReferralProgram();
  const code = data?.code ?? '';
  const link = code ? referralLink(code) : '';

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast.success('הקישור הועתק');
  };

  const shareWa = () => {
    if (!link) return;
    const text = `היי, אני עובד עם רילטיז — צבא סוכני AI שמנהל לקוחות, נכסים ושיווק. הרשמה חינם דרך הקישור: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gift className="h-4 w-4 text-primary" /> תוכנית ההפניות
        </CardTitle>
        <CardDescription>
          כל מי שנרשם דרך הקישור שלך נרשם חינם. כשהוא משדרג לחבילה בתשלום (Agent, Pro או Max) מזוכים לך 50 ₪ לארנק.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input readOnly value={isLoading ? 'טוען…' : link} className="font-mono text-xs" dir="ltr" />
          <Button variant="outline" size="icon" onClick={copy} aria-label="העתק קישור">
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={shareWa} aria-label="שתף בוואטסאפ">
            <Share2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <div className="text-xl font-bold tabular-nums">{data?.total ?? 0}</div>
            <div className="text-xs text-muted-foreground">הפניות</div>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <div className="text-xl font-bold tabular-nums text-primary">{data?.converted_paid ?? 0}</div>
            <div className="text-xs text-muted-foreground">שדרגו לתשלום</div>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <div className="text-xl font-bold tabular-nums text-emerald-600">
              <bdi dir="ltr">₪{Math.round(Number(data?.earned_ils ?? 0)).toLocaleString('he-IL')}</bdi>
            </div>
            <div className="text-xs text-muted-foreground">קרדיט שנצבר</div>
          </div>
        </div>

        {!!data?.referrals?.length && (
          <div className="space-y-1.5">
            {data.referrals.slice(0, 8).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <span className="flex items-center gap-2 truncate">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  {r.name || 'משתמש חדש'}
                </span>
                <Badge variant={r.status === 'converted_paid' ? 'default' : 'secondary'}>
                  {r.status === 'converted_paid' ? 'שדרג לתשלום' : 'נרשם חינם'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ReferralProgramCard;
