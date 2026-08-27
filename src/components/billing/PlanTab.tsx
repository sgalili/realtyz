import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Check } from 'lucide-react';
import { CreditBalancePill } from '@/components/CreditBalancePill';
import { FREE_CONTACTS, FREE_PROPERTIES, PRICE_PER_CONTACT, quoteForContacts } from '@/lib/pricing';
import { fmtILS } from '@/lib/formatCurrency';
import { useFreemiumStatus } from '@/hooks/useFreemiumStatus';

const SALES_PHONE = '972546811841';

const INCLUDED = [
  'CRM מתעניינים מלא',
  'תיבת דואר אומני-צ\'אנל',
  'ניהול נכסים ומלאי חי',
  'יצירת פוסטים ופרסום לרשתות',
  'אוטומציות וסיכומי שיחה',
  'משתמשים וצוות ללא הגבלה',
];

export default function PlanTab() {
  const { contactsUsed, propertiesUsed } = useFreemiumStatus();
  const [contacts, setContacts] = useState(() => Math.max(FREE_CONTACTS, contactsUsed || 250));
  const quote = useMemo(() => quoteForContacts(contacts), [contacts]);

  const requestUpgrade = () => {
    const text = `היי, אני רוצה לשדרג את ריאלטיז ל-${quote.contacts} אנשי קשר (${fmtILS(quote.monthlyPrice)} לחודש).`;
    window.open(`https://wa.me/${SALES_PHONE}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-4 mt-5">
      <div dir="rtl" className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ארנק קמפיינים</p>
          <p className="text-sm text-foreground">יתרת קרדיטים לשירותי פרימיום (SMS, WhatsApp, שיחות AI)</p>
        </div>
        <CreditBalancePill />
      </div>

      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-5 text-center">
            <div className="flex flex-col items-center gap-1">
              <span className="text-4xl font-bold tabular-nums text-primary">
                <bdi dir="ltr">{fmtILS(quote.monthlyPrice)}</bdi>
              </span>
              <span className="text-xs text-muted-foreground">/ חודש</span>
            </div>
            <p className="mt-3 text-sm font-bold text-foreground">
              {quote.isFree
                ? `מסלול חינם נצחי - עד ${FREE_CONTACTS} אנשי קשר ו-${FREE_PROPERTIES} נכסים`
                : `${fmtILS(quote.ratePerContact, { fractionDigits: 2 })} לאיש קשר לחודש · ${FREE_CONTACTS} הראשונים חינם`}
            </p>
            {!quote.isFree && (
              <span className="mt-3 inline-block rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
                {quote.tierLabel}
              </span>
            )}

          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label className="whitespace-nowrap text-right text-sm">מספר אנשי קשר</Label>
              <Input
                type="number"
                min={FREE_CONTACTS}
                value={contacts}
                onChange={(e) => setContacts(Math.max(FREE_CONTACTS, Number(e.target.value) || FREE_CONTACTS))}
                className="w-28 text-center"
              />
            </div>
            <Slider
              dir="rtl"
              value={[Math.min(contacts, 10_000)]}
              min={FREE_CONTACTS}
              max={10_000}
              step={10}
              onValueChange={(v) => setContacts(v[0])}
              aria-label="מספר אנשי קשר"
            />
          </div>

          <ul className="grid gap-2 sm:grid-cols-2">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 shrink-0 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <p className="text-xs text-muted-foreground">
            השימוש הנוכחי שלכם: {contactsUsed.toLocaleString('he-IL')} אנשי קשר · {propertiesUsed.toLocaleString('he-IL')} נכסים.
            IVR ושיחות AI קוליות מתומחרים לפי צריכה בפועל מהארנק.
          </p>

          <Button onClick={requestUpgrade} size="lg" className="w-full">
            שדרוג ופתיחת חלון תשלום ב-WhatsApp
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
