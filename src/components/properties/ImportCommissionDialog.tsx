import { useEffect, useState } from 'react';
import { ClipboardList, Loader2, Phone, Trophy, Zap } from 'lucide-react';
import { WhatsAppIcon } from '@/components/properties/WhatsAppIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { canApplyImportRule, IMPORT_CLOSING_RANGES, type ImportCommissionRule, type ImportDealType } from '@/lib/importCommissionDefaults';
import { commissionOfferFromPrice } from '@/lib/commissionDisplay';
import { LeadPopularityNote } from '@/components/public/LeadPopularityNote';
import BrokerageTermsContent from '@/components/public/BrokerageTermsContent';
import Terms from '@/pages/Terms';

export function ImportCommissionDialog({ open, onOpenChange, count, types, rule, onRuleChange, onApply, saving, closingOnly = false, prices }: {
  open: boolean; onOpenChange: (open: boolean) => void; count: number; types: ImportDealType[];
  rule: ImportCommissionRule; onRuleChange: (rule: ImportCommissionRule) => void;
  onApply: (accepted: boolean) => void; saving: boolean;
  closingOnly?: boolean;
  /** Average base price per deal type (asking price / one month's rent), used to show shekel amounts. */
  prices?: Partial<Record<ImportDealType, number>>;
}) {
  const [mode, setMode] = useState<ImportDealType>('sale');
  const [accepted, setAccepted] = useState(false);
  const [legal, setLegal] = useState<'terms' | 'brokerage' | null>(null);
  useEffect(() => { if (open) { setAccepted(false); setMode(types[0] ?? 'sale'); } }, [open]);
  const selected = types.includes(mode) ? mode : types[0] ?? 'sale';
  const range = IMPORT_CLOSING_RANGES[selected];
  const value = selected === 'sale' ? rule.salePercent : rule.rentMonthlyPercent;
  const level = Math.min(3, Math.max(0, Math.floor((value - range.min) / (range.max - range.min) * 4)));
  const basePrice = Math.max(0, Number(prices?.[selected]) || 0);
  const offer = (percent: number) => commissionOfferFromPrice(basePrice, percent);
  const num = (key: 'form' | 'whatsapp' | 'phone', value: string) => onRuleChange({ ...rule, [key]: Math.max(0, Number(value) || 0) });
  const valid = count > 0 && canApplyImportRule(rule, types, accepted);
  return <>
    <Dialog open={open} onOpenChange={next => { if (!saving) onOpenChange(next); }}>
      <DialogContent dir="rtl" className="max-h-[90dvh] max-w-md overflow-y-auto">
        <DialogHeader><DialogTitle>הגדרת עמלות ל־{count} נכסים {closingOnly ? 'נבחרים' : 'שיובאו'}</DialogTitle><DialogDescription className="sr-only">העמלות יחולו על הנכסים {closingOnly ? 'הנבחרים' : 'שיובאו'}. ניתן לעדכן כל נכס בנפרד בהמשך.</DialogDescription></DialogHeader>
        <div role="note" className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm font-semibold text-primary"><Zap className="mt-0.5 h-4 w-4 shrink-0" />השינויים בחלון זה יחולו מיד על כל {count} הנכסים {closingOnly ? 'הנבחרים' : 'שיובאו'}.</div>
        {types.length > 1 && <Tabs value={selected} onValueChange={next => { if (next === 'sale' || next === 'rent') setMode(next); }} dir="rtl">
          <TabsList className="flex w-full">{types.map(type => <TabsTrigger className="flex-1" key={type} value={type}>{type === 'sale' ? 'מכירה' : 'השכרה'}</TabsTrigger>)}</TabsList>
        </Tabs>}
        <section className="closing-fee space-y-3 rounded-lg border p-3" data-level={level}>
          <Label className="flex items-center gap-1.5"><Trophy className="h-4 w-4 text-lead-closing" />אומדן סגירה ({selected === 'sale' ? 'ממחיר הנכס' : 'משכר הדירה החודשי'})</Label>
          <p className="text-center text-3xl font-bold closing-tone" dir="ltr">{offer(value)}</p>
          <Slider dir="ltr" className="closing-slider h-6" aria-label={selected === 'sale' ? 'עמלת סגירה במכירה' : 'עמלת סגירה בהשכרה'} min={range.min} max={range.max} step={range.step} value={[value]} disabled={saving} onValueChange={values => { const next = values[0]; if (next !== undefined) onRuleChange({ ...rule, [selected === 'sale' ? 'salePercent' : 'rentMonthlyPercent']: next }); }} />
          <div dir="ltr" className="flex justify-between text-xs text-muted-foreground"><span>{offer(range.min)}</span><span>{offer(range.max)}</span></div>
          {basePrice > 0 && count > 1 && <p className="text-center text-[11px] leading-relaxed text-muted-foreground">הסכום בשקלים מחושב לפי {selected === 'sale' ? 'מחיר הנכס הממוצע' : 'שכר הדירה החודשי הממוצע'} של {count} הנכסים {closingOnly ? 'הנבחרים' : 'שיובאו'}.</p>}
          <LeadPopularityNote />
          <p className="text-sm leading-relaxed text-muted-foreground">{selected === 'sale' ? 'עמלת הסגירה תחושב לפי מחיר הנכס המפורסם ותשולם לאחר סגירת העסקה.' : 'עמלת הסגירה תחושב מתוך שכר דירה של חודש אחד ותשולם לאחר חתימת הסכם השכירות.'}</p>
        </section>
        <div className="space-y-2">{([['form', 'ליד מטופס', ClipboardList, 'text-lead-form'], ['whatsapp', 'ליד מסונן בוואטסאפ', WhatsAppIcon, 'text-lead-whatsapp'], ['phone', 'ליד מסונן בשיחת טלפון', Phone, 'text-lead-phone']] as const).map(([key, label, Icon, tone]) => <div key={key} className="flex items-center gap-3 rounded-lg border p-3"><Icon className={`h-5 w-5 shrink-0 ${tone}`} /><Label htmlFor={`import-${key}`} className="flex-1">{label}</Label><div className="relative w-28"><span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₪</span><Input id={`import-${key}`} dir="ltr" className="pe-6 text-center font-semibold" disabled={saving} inputMode="numeric" value={rule[key]} onChange={event => num(key, event.target.value)} /></div></div>)}</div>
        <div className="flex items-start gap-2"><Checkbox id="import-commission-terms" checked={accepted} disabled={saving} onCheckedChange={next => setAccepted(next === true)} className="mt-1 shrink-0" /><div className="text-sm leading-relaxed"><Label htmlFor="import-commission-terms" className="font-normal">אני מאשר/ת שקראתי והסכמתי לתקנון ולתנאי התיווך, ומתחייב/ת לשלם את העמלות בהתאם לתנאים המוסכמים.</Label><div className="flex flex-wrap gap-3"><Button type="button" variant="link" className="h-auto p-0" onClick={() => setLegal('terms')}>תקנון</Button><Button type="button" variant="link" className="h-auto p-0" onClick={() => setLegal('brokerage')}>תנאי התיווך</Button></div></div></div>
        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between"><Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>ביטול</Button><Button disabled={!valid || saving} onClick={() => { if (valid) onApply(accepted); }}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}אישור והחלה</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={legal !== null} onOpenChange={next => { if (!next) setLegal(null); }}><DialogContent dir="rtl" className="grid h-[90dvh] max-w-3xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden"><DialogHeader><DialogTitle>{legal === 'brokerage' ? 'תנאי התיווך' : 'תקנון'}</DialogTitle></DialogHeader><div className="min-h-0 overflow-y-auto">{legal === 'brokerage' ? <BrokerageTermsContent /> : <Terms embedded />}</div></DialogContent></Dialog>
  </>;
}