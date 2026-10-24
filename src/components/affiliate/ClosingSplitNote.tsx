import { partnerNetReward, realtyzCommission } from '@/lib/affiliatePlans';
import { fmtILS } from '@/lib/formatCurrency';

export const CLOSING_SPLIT_EXPLANATION = 'מתוך עמלת הסגירה שנקבעה, 80% משולמים למתווך/שותף בעל רישיון תיווך מאומת שסיפק את הליד, ו־20% נשארים ב־TORAFF כדמי פלטפורמה. התגמול המוצג לשותף הוא חלקו נטו, לאחר דמי הפלטפורמה.';

export function ClosingSplitNote({ gross, valueType = 'percent', registration = false }: { gross?: number; valueType?: 'fixed' | 'percent'; registration?: boolean }) {
  const format = (amount: number) => valueType === 'percent' ? `${amount.toLocaleString('he-IL', { maximumFractionDigits: 2 })}%` : fmtILS(amount);
  return <p dir="rtl" className="text-xs font-normal leading-relaxed text-muted-foreground">
    {!registration && <span aria-hidden="true">* </span>}{CLOSING_SPLIT_EXPLANATION}
    {gross !== undefined && gross > 0 ? <> בעמלה שנקבעה של <bdi dir="ltr">{format(gross)}</bdi>, חלק המתווך הוא <bdi dir="ltr">{format(partnerNetReward(gross))}</bdi> ודמי הפלטפורמה הם <bdi dir="ltr">{format(realtyzCommission(gross))}</bdi>.</> : <> לדוגמה: עמלת סגירה של <bdi dir="ltr">1.0%</bdi> מתחלקת ל־<bdi dir="ltr">0.8%</bdi> למתווך ול־<bdi dir="ltr">0.2%</bdi> לפלטפורמה.</>}
  </p>;
}