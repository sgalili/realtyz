// Broker-side invite panel for the Affiliate Network page.
// Explains how the network works and shares the broker's unique invitation URL
// over WhatsApp, SMS or email.
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Mail, MessageCircle, MessageSquare, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { useReferralProgram } from '@/hooks/useReferralProgram';
import { referralLink } from '@/lib/referralAttribution';

const STEPS = [
  'מזמינים שותפי שיווק בקישור האישי שלכם — כל הרשמה משויכת אליכם אוטומטית.',
  'קובעים לכל נכס תגמול (סכום קבוע או אחוז מהעמלה) ופותחים אותו לזירת השותפים.',
  'השותף משווק את הנכס ומביא מתעניינים — כל כניסה, ליד ועסקה נרשמים בטאב "מתעניינים משותפים".',
  'על עסקה שנחתמת דרך שותף משלמים את התגמול ומסמנים הסדרה — הכול מתועד במקום אחד.',
];

export function AffiliateInviteCard() {
  const { data, isLoading } = useReferralProgram();
  const code = data?.code ?? '';
  const link = code ? referralLink(code) : '';

  const message = `היי, אני מזמין אותך להיות שותף שיווק שלי ברילטיז. תקבל גישה לנכסים שלי ותגמול על כל עסקה שתביא. הרשמה חינם: ${link}`;

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast.success('הקישור הועתק');
  };

  const open = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

  return (
    <Card dir="rtl" className="border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Share2 className="h-4 w-4 text-sky-600" /> איך רשת השותפים עובדת
        </CardTitle>
        <CardDescription>
          רשת השותפים מאפשרת לכם לגייס משווקים חיצוניים שיביאו מתעניינים לנכסים שלכם, בתשלום רק על תוצאה.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-2">
          {STEPS.map((s, i) => (
            <li key={s} className="flex gap-2.5 text-[13px] leading-relaxed text-slate-600">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-50 text-[11px] font-bold text-sky-700">
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>

        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="text-[12px] font-semibold text-slate-700">קישור ההזמנה האישי שלכם</div>
          <div className="flex gap-2">
            <Input
              readOnly
              value={isLoading ? 'טוען…' : link || 'לא נוצר קישור'}
              className="bg-white font-mono text-xs"
              dir="ltr"
            />
            <Button variant="outline" size="icon" onClick={copy} disabled={!link} aria-label="העתק קישור">
              <Copy className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              disabled={!link}
              onClick={() => open(`https://wa.me/?text=${encodeURIComponent(message)}`)}
            >
              <MessageCircle className="me-1.5 h-4 w-4 text-emerald-600" /> הזמנה בוואטסאפ
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!link}
              onClick={() => open(`sms:?&body=${encodeURIComponent(message)}`)}
            >
              <MessageSquare className="me-1.5 h-4 w-4 text-sky-600" /> הזמנה ב-SMS
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!link}
              onClick={() =>
                open(
                  `mailto:?subject=${encodeURIComponent('הזמנה להיות שותף שיווק ברילטיז')}&body=${encodeURIComponent(message)}`,
                )
              }
            >
              <Mail className="me-1.5 h-4 w-4 text-indigo-600" /> הזמנה במייל
            </Button>
          </div>
          <p className="text-[11px] text-slate-500">
            כל מי שנרשם דרך הקישור משויך אליכם לצמיתות ויופיע ברשת השותפים שלכם.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default AffiliateInviteCard;
