export const ZERO_LEAD_PRICE_WARNING = 'ללא מחיר לפחות לסוג פנייה אחד, הנכס יפורסם רק ברשת המתווכים המורשים ולא יופיע בלוח הציבורי או יגיע לכל השותפים.';

export function ZeroLeadPriceWarning() {
  return <p role="alert" className="rounded-md border border-warning/50 bg-warning/10 p-3 text-start text-base leading-relaxed">{ZERO_LEAD_PRICE_WARNING}</p>;
}