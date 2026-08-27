import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PriceTag } from '@/components/PriceTag';
import { cn } from '@/lib/utils';
import {
  PACKAGES,
  UNIVERSAL_FEATURES,
  TOUCHES_PER_CONTACT,
  limitLabel,
  monthlyTouches,
  yearlyPrice,
} from '@/lib/pricing';

/**
 * מסך תמחור מאוחד: קופסה אחת, בחירת חבילה משנה רק את המחיר והיקף אנשי הקשר.
 * כל החבילות כוללות את כל היכולות. תשלום שנתי = 10 חודשים (2 חודשים מתנה).
 */
export default function PricingSection() {
  const [selected, setSelected] = useState(PACKAGES.find((p) => p.highlight)?.id ?? PACKAGES[0].id);
  const [yearly, setYearly] = useState(false);
  const pkg = PACKAGES.find((p) => p.id === selected) ?? PACKAGES[0];
  const price = yearly ? yearlyPrice(pkg.monthlyPrice) : pkg.monthlyPrice;

  return (
    <section id="pricing" className="border-t border-border/60 py-20">
      <div className="mx-auto w-full max-w-3xl px-4">
        <h2 className="landing-title-gradient text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
          חבילות ומחירים
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-muted-foreground">
          כל החבילות כוללות את כל היכולות ללא הגבלה. ההבדל היחיד הוא היקף אנשי הקשר.
        </p>

        <div className="mt-10 rounded-3xl border border-primary/40 bg-card/70 p-6 text-right shadow-xl shadow-primary/10 sm:p-8">
          {/* בחירת חבילה */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PACKAGES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p.id)}
                className={cn(
                  'rounded-xl border px-3 py-3 text-center transition-colors',
                  p.id === selected
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border/60 text-muted-foreground hover:border-primary/50',
                )}
              >
                <span className="block text-sm font-extrabold">{p.name}</span>
                <span className="mt-0.5 block text-[11px]">{limitLabel(p.contacts)} אנשי קשר</span>
              </button>
            ))}
          </div>

          {/* חודשי / שנתי */}
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setYearly(false)}
              className={cn(
                'rounded-full px-4 py-2 text-[13px] font-bold transition-colors',
                yearly ? 'text-muted-foreground' : 'bg-primary text-primary-foreground',
              )}
            >
              חודשי
            </button>
            <button
              type="button"
              onClick={() => setYearly(true)}
              className={cn(
                'rounded-full px-4 py-2 text-[13px] font-bold transition-colors',
                yearly ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              שנתי · 2 חודשים מתנה
            </button>
          </div>

          {/* מחיר */}
          <div className="mt-6 flex flex-wrap items-baseline justify-end gap-2">
            <PriceTag value={price} className="text-4xl font-extrabold" />
            <span className="text-sm text-muted-foreground">{yearly ? '/ לשנה' : '/ לחודש'}</span>
            {yearly && pkg.monthlyPrice > 0 && (
              <span className="text-xs text-muted-foreground">
                (במקום <PriceTag value={pkg.monthlyPrice * 12} /> - חודשיים חינם)
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{pkg.tagline}</p>

          {/* מה כלול */}
          <ul className="mt-6 space-y-2 text-[14px] leading-relaxed">
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>עד {limitLabel(pkg.contacts)} אנשי קשר מנוהלים</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                {limitLabel(monthlyTouches(pkg))} מגעי AI בחודש ({TOUCHES_PER_CONTACT} לכל איש קשר)
              </span>
            </li>
            {UNIVERSAL_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <Link to="/auth" className="mt-7 block">
            <Button className="h-12 w-full text-sm font-extrabold">
              {pkg.monthlyPrice === 0 ? 'התחלה בחינם' : 'בחירת מסלול'}
            </Button>
          </Link>

          <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
            מגע = כל פעולה שמפעילה AI: יצירת תוכן, פרסום, תשובה ב-WhatsApp/SMS/טלגרם/פייסבוק או
            תגובה. שיחת WhatsApp שלמה נספרת כמגע אחד בחלון של 24 שעות. כשנגמרים הקרדיטים אפשר
            לטעון את הארנק בתוך המערכת ולהמשיך לעבוד.
          </p>
        </div>

        <p className="mx-auto mt-8 max-w-3xl text-center text-sm text-muted-foreground">
          המחירים אינם כוללים מע"מ.
        </p>
      </div>
    </section>
  );
}
