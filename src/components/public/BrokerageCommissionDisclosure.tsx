import { Link } from 'react-router-dom';
import { BadgePercent } from 'lucide-react';

export const BROKERAGE_COMMISSION_TITLE = 'עמלות תיווך ותנאי שירות (Brokerage Commissions)';

/** Public customer fees, never partner reward/closing-payout information. */
export default function BrokerageCommissionDisclosure() {
  return (
    <aside dir="rtl" aria-label="עמלות התיווך של Realtyz" className="min-w-0 border-s-4 border-primary bg-primary/5 px-4 py-3 text-sm leading-relaxed text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 font-bold"><BadgePercent className="h-5 w-5 shrink-0 text-primary" />עמלות התיווך של Realtyz</p>
        <Link to="/terms#brokerage-commissions" className="font-semibold text-primary underline underline-offset-4">תנאי התיווך</Link>
      </div>
      <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2">
        <p><strong>קונים: 1% בלבד</strong> ממחיר הסגירה הסופי של הנכס, לעומת עמלה מקובלת של 2%.</p>
        <p><strong>שוכרים: 10% בלבד</strong> משכר דירה של חודש אחד, לעומת עמלה מקובלת של חודש שכירות מלא.</p>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">שירותי התיווך של Realtyz ניתנים באמצעות מתווך בעל רישיון ישראלי ובכפוף להזמנת שירותי תיווך בכתב ולדין. תנאי המוכרים והמשכירים נשארים כפי שסוכמו בהסכמים החתומים שלהם.</p>
    </aside>
  );
}