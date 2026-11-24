import { useState, useSyncExternalStore } from 'react';
import { Check, X } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getCreditsPerIls, subscribeCreditRate } from '@/lib/credits';
import { WALLET_PACKAGE_MIN, WALLET_PACKAGE_MAX, walletPackage, validWalletPackage } from '../../../supabase/functions/_shared/walletPackage';

const fmt = (n: number) => n.toLocaleString('he-IL', { maximumFractionDigits: 2 });

/** Click-to-edit figure with confirm (V) and cancel (X). */
function EditableFigure({ label, display, initial, onConfirm, className }: { label: string; display: string; initial: string; onConfirm: (raw: string) => void; className?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null) {
    return <button type="button" aria-label={`עריכת ${label}`} title={`עריכת ${label}`} onClick={() => setDraft(initial)}
      className={`border-b border-dotted border-current tabular-nums ${className ?? ''}`}>{display}</button>;
  }
  const confirm = () => { onConfirm(draft); setDraft(null); };
  return <span className="inline-flex items-center gap-1">
    <Input autoFocus aria-label={label} className="h-9 w-32 text-center" dir="ltr" type="number" inputMode="decimal" step="0.01" value={draft}
      onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } if (e.key === 'Escape') setDraft(null); }} />
    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-success" aria-label="אישור" onClick={confirm}><Check className="h-4 w-4" /></Button>
    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" aria-label="ביטול" onClick={() => setDraft(null)}><X className="h-4 w-4" /></Button>
  </span>;
}

export function WalletPackageSelector({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const rate = useSyncExternalStore(subscribeCreditRate, getCreditsPerIls, getCreditsPerIls);
  const amount = Number(value);
  const valid = validWalletPackage(amount);
  const pkg = valid ? walletPackage(amount, rate) : null;
  const baseCredits = valid ? Math.round(amount * rate * 100) / 100 : 0;
  const bonusCredits = pkg ? Math.round((pkg.credits - baseCredits) * 100) / 100 : 0;
  return <section className="space-y-4 border-b border-border pb-5" aria-label="חבילת קרדיטים">
    <div className="space-y-1 text-center" aria-live="polite" aria-atomic="true">
      <p className="text-3xl font-bold text-primary">
        <EditableFigure label="סכום להפקדה בשקלים" display={valid ? `${fmt(amount)} ₪` : '—'} initial={value} onConfirm={onChange} />
      </p>
      <p className="text-base text-foreground">
        <EditableFigure label="כמות קרדיטים" display={valid ? fmt(baseCredits) : '—'} initial={valid ? String(baseCredits) : ''}
          onConfirm={raw => { const credits = Number(raw); if (Number.isFinite(credits) && rate > 0) onChange(String(Math.round((credits / rate) * 100) / 100)); }} />
        {' '}קרדיטים
        {bonusCredits > 0 && <span className="font-semibold text-success"> + {fmt(bonusCredits)} קרדיטים בונוס</span>}
      </p>
      <p className="min-h-6 text-sm font-semibold text-muted-foreground">{pkg && bonusCredits > 0 ? `סה"כ ${fmt(pkg.credits)} קרדיטים` : '\u00a0'}</p>
    </div>
    <Slider dir="ltr" aria-label="סכום חבילת קרדיטים" aria-valuetext={`${valid ? amount : WALLET_PACKAGE_MIN} שקלים`} min={WALLET_PACKAGE_MIN} max={WALLET_PACKAGE_MAX} step={0.01} value={[Math.min(WALLET_PACKAGE_MAX, Math.max(WALLET_PACKAGE_MIN, Number.isFinite(amount) ? amount : WALLET_PACKAGE_MIN))]} onValueChange={([next]) => { if (next !== undefined) onChange(String(Math.round(next * 100) / 100)); }} />
    <div className="flex justify-between text-sm text-muted-foreground" dir="ltr"><span>5 ₪</span><span>2,500 ₪</span></div>
    {!valid && <p role="alert" className="text-sm text-destructive">יש להזין סכום בין 5 ל־2,500 ₪, עד שתי ספרות אחרי הנקודה.</p>}
  </section>;
}
