import { Check, Mail, MessageCircle, Phone, PhoneCall, Send } from 'lucide-react';
import { PriceTag } from '@/components/PriceTag';
import {
  CHANNEL_RATES,
  EXTRA_TC_PRICE_PER_CONTACT,
  FREE_TC_PER_CONTACT,
  type ChannelKey,
} from '@/lib/touchCredits';

const ICONS: Record<ChannelKey, typeof Send> = {
  sms: Send,
  whatsapp: MessageCircle,
  voice: Phone,
  ivr: PhoneCall,
  email: Mail,
};

/** סקשן קצר וחד: מדיניות מגעי קרדיט + התעריפים הזולים בישראל. */
export default function CreditsSection() {
  return (
    <section id="credits" className="border-t border-border/60 py-16">
      <div className="mx-auto w-full max-w-4xl px-4 text-center">
        <h2 className="landing-title-gradient text-3xl font-extrabold tracking-tight sm:text-4xl">
          מגעי קרדיט ותעריפי הפצה
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-muted-foreground">
          {FREE_TC_PER_CONTACT} מגעי AI חינם לכל איש קשר בחודש — כלולים בכל חבילה. מעבר לזה, התעריפים
          הזולים בישראל.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-primary/40 bg-card/70 p-5 text-right">
            <p className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <b>{FREE_TC_PER_CONTACT} T.C. לכל איש קשר בחודש</b> כלולים במלואם — כל פעולה של ה-AI
                בוואטסאפ, SMS, אימייל, שיחות קוליות ו-IVR.
              </span>
            </p>
            <p className="mt-3 flex items-start gap-2 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                מגע נוסף: <PriceTag value={EXTRA_TC_PRICE_PER_CONTACT} fractionDigits={2} /> לאיש קשר
                (ולא לפי נפח מצטבר). טעינת ארנק בתוך המערכת בכל רגע.
              </span>
            </p>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/70 p-2 text-right">
            <div className="divide-y divide-border/60">
              {CHANNEL_RATES.map((rate) => {
                const Icon = ICONS[rate.key];
                return (
                  <div key={rate.key} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {rate.label}
                    </span>
                    <span className="font-bold tabular-nums">
                      <PriceTag value={rate.price} fractionDigits={2} />
                      <span className="ms-1 text-[11px] font-normal text-muted-foreground">{rate.unit}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <p className="mt-6 text-sm font-semibold text-primary">
          הפלטפורמה הזולה בישראל להפצה חכמה בכל הערוצים.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          שירותים שמופעלים על ידי ה-AI כלולים בחבילה. חיוב נוסף חל רק על הפצה פרטית עצמאית. המחירים אינם כוללים מע"מ.
        </p>
      </div>
    </section>
  );
}
