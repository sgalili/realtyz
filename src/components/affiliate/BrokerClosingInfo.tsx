// Informational tooltip beside closing-commission sections. Closing fees
// (0.2%–2% of the deal, set by the advertiser) are a licensed-brokerage
// activity; this links interested users to the official licensing registry.
import { HelpCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** Official Israeli real-estate broker registry / licensing information (gov.il). */
export const REAL_ESTATE_LICENSING_URL = 'https://www.gov.il/he/departments/general/real_estate_brokers';

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
