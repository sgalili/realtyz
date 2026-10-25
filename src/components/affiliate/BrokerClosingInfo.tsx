// Informational tooltip beside closing-commission sections. Closing fees
// (0.2%–2% of the deal, set by the advertiser) are a licensed-brokerage
// activity; this links interested users to the official licensing registry.
import { HelpCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** Online course for the Israeli real-estate broker exam (easytest.co.il). */
export const BROKER_COURSE_URL = 'https://easytest.co.il/he/professions/%D7%9E%D7%91%D7%97%D7%9F-%D7%AA%D7%99%D7%95%D7%95%D7%9A?referral=TORAFF';

/** Official gov.il registration page for the upcoming real-estate broker exam. */
export const BROKER_EXAM_REGISTRATION_URL = 'https://www.gov.il/he/service/registration_for_examination_in_real_estate_law';

/** The two official paths to becoming a licensed broker: the prep course and exam registration. */
export function BrokerTestLinks({ className = '' }: { className?: string }) {
  return <div className={`space-y-1 ${className}`}>
    <a
      href={BROKER_COURSE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block font-medium text-primary underline underline-offset-2"
    >
      קורס הכנה למבחן התיווך (easytest)
    </a>
    <br />
    <a
      href={BROKER_EXAM_REGISTRATION_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block font-medium text-primary underline underline-offset-2"
    >
      הרשמה למבחן המתווכים הקרוב (gov.il)
    </a>
  </div>;
}

export function BrokerClosingInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="מידע על עמלות סגירה ורישוי מתווכים"
          title="מידע על עמלות סגירה ורישוי מתווכים"
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent dir="rtl" align="start" className="w-80 space-y-2 text-sm">
        <p className="font-semibold">עמלות סגירת עסקה</p>
        <p className="leading-relaxed text-muted-foreground">
          עמלת הסגירה נעה בין 0.2% ל־2% מערך העסקה, בהתאם לקביעת המפרסם, ומיועדת אך ורק למתווכים בעלי רישיון תיווך ישראלי בתוקף.
        </p>
        <a
          href={REAL_ESTATE_LICENSING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block font-medium text-primary underline underline-offset-2"
        >
          לאתר הרישוי הרשמי — קורס מתווכים (gov.il)
        </a>
      </PopoverContent>
    </Popover>
  );
}

export default BrokerClosingInfo;
