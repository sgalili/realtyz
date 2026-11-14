import { closingLevelClass } from '@/lib/leadPriceRanges';

const levels = ['נמוך', 'בינוני', 'גבוה', 'מרבי'];

/** The same four price levels used by the board's reward icons. */
export function LeadPricingHeatmap() {
  return <section aria-label="מפת החום של הלידים" className="space-y-3 border-t border-border pt-4">
    <h3 className="text-lg font-bold">מפת החום של הלידים</h3>
    <div dir="ltr" className="grid grid-cols-4 gap-2 text-center text-base">
      {levels.map((label, level) => <div key={label} dir="rtl" className="flex min-w-0 flex-col items-center gap-2">
        <span aria-hidden className={`h-2 w-full rounded-full bg-current ${closingLevelClass(level)}`} />
        <span>{label}</span>
      </div>)}
    </div>
    <p className="text-sm leading-relaxed text-muted-foreground">הצבע מציין את גובה המחיר בטווח של כל סוג ליד, מהמחיר הנמוך לְמרבי.</p>
  </section>;
}