import { Link } from 'react-router-dom';

export const BROKERAGE_COMMISSION_TITLE = 'עמלות תיווך ותנאי שירות (Brokerage Commissions)';
type Props = { audience?: 'buyer' | 'renter' | 'seller' | 'landlord' | null };

/** Short workflow notice; the full official disclosure lives only in Terms. */
export default function BrokerageCommissionDisclosure({ audience }: Props) {
  if (!audience) return null;
  const text = audience === 'buyer'
    ? 'לקונים: עמלת התיווך של TORAFF היא 1% ממחיר הסגירה הסופי של הנכס.'
    : audience === 'renter'
      ? 'לשוכרים: עמלת התיווך של TORAFF היא 10% משכר דירה של חודש אחד בלבד.'
      : audience === 'seller'
        ? 'למוכרים: תנאי השירות ועמלת התיווך נקבעים לפי הסכם התיווך הספציפי החתום עמכם.'
        : 'למשכירים: תנאי השירות ועמלת התיווך נקבעים לפי הסכם התיווך הספציפי החתום עמכם.';
  return (
    <aside dir="rtl" aria-label="תנאי התיווך הרלוונטיים" className="min-w-0 text-xs leading-relaxed text-muted-foreground">
      <p>{text} <Link to="/terms#brokerage-commissions" className="font-semibold text-primary underline underline-offset-4">תנאי התיווך</Link></p>
    </aside>
  );
}
