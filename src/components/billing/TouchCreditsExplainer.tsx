import { useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { PriceTag } from '@/components/PriceTag';
import {
  CHANNEL_RATES,
  EXTRA_TC_PRICE_PER_CONTACT,
  FREE_TC_PER_CONTACT,
} from '@/lib/touchCredits';

/** הסבר מלא ופשוט על מגעי קרדיט (T.C) — משותף לדף הנחיתה ולטאב החבילות. */
export function TouchCreditsExplainerBody() {
  return (
    <div dir="rtl" className="space-y-4 text-right text-sm leading-relaxed">
      <section className="space-y-2">
        <h3 className="text-base font-extrabold">מה זה מגע קרדיט (T.C)?</h3>
        <p className="text-muted-foreground">
          מגע אחד = פעולה אחת שה-AI מבצע מול איש קשר: תשובה בוואטסאפ, הודעת SMS, אימייל,
          שיחה קולית, מענה ל-IVR או תגובה ברשתות. שיחת וואטסאפ שלמה נספרת כמגע אחד בחלון של
          24 שעות, גם אם הוחלפו בה עשר הודעות.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-extrabold">מה כלול בחבילה?</h3>
        <p className="flex items-start gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            <b>{FREE_TC_PER_CONTACT} מגעים לכל איש קשר בחודש</b> — כלולים במלואם בכל חבילה,
            בכל הערוצים, בלי הפרדה בין וואטסאפ, SMS, אימייל, שיחות קוליות ו-IVR.
          </span>
        </p>
        <p className="flex items-start gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            המכסה מחושבת לכל איש קשר בנפרד, ומתאפסת בתחילת כל חודש קלנדרי.
          </span>
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-extrabold">דוגמאות מהחיים</h3>
        <ul className="space-y-1.5 text-muted-foreground">
          <li>
            מתעניין חדש נכנס, ה-AI עונה לו, שולח שני נכסים ומתזכר אחרי יומיים — 3 מגעים מתוך{' '}
            {FREE_TC_PER_CONTACT}.
          </li>
          <li>
            לקוח מתכתב איתכם 20 הודעות באותו יום — מגע אחד בלבד (חלון 24 שעות).
          </li>
          <li>
            איש קשר שקיבל 15 מגעים והמערכת ממשיכה לטפל בו — נוספת עלות של{' '}
            <PriceTag value={EXTRA_TC_PRICE_PER_CONTACT} fractionDigits={2} /> על אותו איש קשר.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-extrabold">איך מחושבת חריגה?</h3>
        <p className="text-muted-foreground">
          החריגה נמדדת <b>לפי איש קשר ולא לפי נפח מצטבר</b>. כל איש קשר שעבר את מכסת{' '}
          {FREE_TC_PER_CONTACT} המגעים באותו חודש מחויב ב-
          <PriceTag value={EXTRA_TC_PRICE_PER_CONTACT} fractionDigits={2} /> נוספים, ללא תלות
          בכמה מגעים נוספים בוצעו מולו. הסכום נגרע מארנק הקרדיטים, שניתן לטעון בתוך המערכת
          בכל רגע.
        </p>
        <p className="text-muted-foreground">
          לדוגמה: 40 אנשי קשר חרגו מהמכסה בחודש מסוים ⇒ החיוב הנוסף הוא{' '}
          <PriceTag value={40 * EXTRA_TC_PRICE_PER_CONTACT} fractionDigits={2} /> בלבד.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-extrabold">הפצה פרטית (מחוץ ל-AI)</h3>
        <div className="divide-y rounded-xl border border-border/60">
          {CHANNEL_RATES.map((rate) => (
            <div key={rate.key} className="flex items-center justify-between px-3 py-2">
              <span>{rate.label}</span>
              <span className="font-bold tabular-nums">
                <PriceTag value={rate.price} fractionDigits={2} />
                <span className="ms-1 text-[11px] font-normal text-muted-foreground">{rate.unit}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          פעולות שה-AI מבצע כלולות במכסת המגעים. התעריפים האלה חלים רק על הפצה עצמאית שאתם
          יוזמים בעצמכם. המחירים אינם כוללים מע"מ.
        </p>
      </section>
    </div>
  );
}

/** קישור "הסבר" שפותח מודאל עם ההסבר המלא. */
export function TouchCreditsExplainerLink({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="font-bold text-primary underline underline-offset-4 hover:opacity-80"
        >
          {children ?? 'הסבר'}
        </button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-h-[85vh] max-w-lg overflow-y-auto text-right">
        <DialogHeader className="text-right">
          <DialogTitle>איך עובדים מגעי קרדיט (T.C)?</DialogTitle>
          <DialogDescription>הסבר פשוט, עם דוגמאות ואופן חישוב החריגה.</DialogDescription>
        </DialogHeader>
        <TouchCreditsExplainerBody />
      </DialogContent>
    </Dialog>
  );
}
