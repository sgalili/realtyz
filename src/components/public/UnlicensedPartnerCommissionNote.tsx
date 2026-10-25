/**
 * The one required wording for how a closing commission is handled when the lead
 * arrived through a partner who does not hold an Israeli real-estate brokerage
 * licence. It is shown wherever closing commissions are explained: the commission
 * mechanism and Terms pages, and the master lead-pricing window.
 */
export const UNLICENSED_PARTNER_COMMISSION_NOTE = 'במקרים בהם ליד נוצר על ידי שותף שאינו מחזיק ברישיון תיווך במקרקעין כחוק, עמלת התיווך עבור סגירת העסקה מנוהלת ומתקבלת דרך מתווך מורשה מטעם פלטפורמת TORAFF, בהתאם להוראות חוק המתווכים.';

/** A quiet footnote for that wording; the legal pages keep the same text. */
export function UnlicensedPartnerCommissionNote({ className = '' }: { className?: string }) {
  return <p className={`text-xs leading-relaxed text-muted-foreground ${className}`}>{UNLICENSED_PARTNER_COMMISSION_NOTE}</p>;
}

export default UnlicensedPartnerCommissionNote;
