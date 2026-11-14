import { useSyncExternalStore } from 'react';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getCreditsPerIls, subscribeCreditRate } from '@/lib/credits';
import { WALLET_PACKAGE_MIN, WALLET_PACKAGE_MAX, walletPackage, validWalletPackage } from '../../../supabase/functions/_shared/walletPackage';

export function WalletPackageSelector({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const rate = useSyncExternalStore(subscribeCreditRate, getCreditsPerIls, getCreditsPerIls);
  const amount = Number(value);
  const valid = validWalletPackage(amount);
  const pkg = valid ? walletPackage(amount, rate) : null;
  return <section className="space-y-4 border-b border-border pb-5" aria-label="חבילת קרדיטים">
    <div className="space-y-1 text-center" aria-live="polite" aria-atomic="true">
      <p className="text-3xl font-bold tabular-nums text-primary">{pkg ? pkg.credits.toLocaleString('he-IL', { maximumFractionDigits: 2 }) : '—'} <span className="text-lg font-semibold">קרדיטים</span></p>
      <p className="text-sm text-muted-foreground">שווי: {valid ? amount.toLocaleString('he-IL', { maximumFractionDigits: 2 }) : '—'} ₪</p>
      <p className="min-h-6 text-sm font-semibold text-success">{pkg ? `${pkg.percent}% בונוס` : '\u00a0'}</p>
    </div>
    <Slider dir="ltr" aria-label="סכום חבילת קרדיטים" aria-valuetext={`${valid ? amount : WALLET_PACKAGE_MIN} שקלים`} min={WALLET_PACKAGE_MIN} max={WALLET_PACKAGE_MAX} step={0.01} value={[Math.min(WALLET_PACKAGE_MAX, Math.max(WALLET_PACKAGE_MIN, Number.isFinite(amount) ? amount : WALLET_PACKAGE_MIN))]} onValueChange={([next]) => { if (next !== undefined) onChange(String(Math.round(next * 100) / 100)); }} />
    <div className="flex justify-between text-sm text-muted-foreground" dir="ltr"><span>5 ₪</span><span>2,500 ₪</span></div>
    <div className="flex items-center justify-between gap-3"><Label htmlFor="topup-amount">סכום להפקדה (₪)</Label><Input id="topup-amount" className="w-36" dir="ltr" type="number" inputMode="decimal" min={WALLET_PACKAGE_MIN} max={WALLET_PACKAGE_MAX} step="0.01" value={value} aria-invalid={!valid} onChange={e => onChange(e.target.value)} /></div>
    {!valid && <p role="alert" className="text-sm text-destructive">יש להזין סכום בין 5 ל־2,500 ₪, עד שתי ספרות אחרי הנקודה.</p>}
  </section>;
}