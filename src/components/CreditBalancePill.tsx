import { useState } from 'react';
import { Wallet } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useCreditWallet } from '@/hooks/useSubscription';

const SALES_PHONE = '972546811841';

const RATES: { label: string; price: string }[] = [
  { label: 'הודעת SMS קצרה (עד 72 תווים)', price: '₪0.02' },
  { label: 'הודעת SMS ארוכה (עד 210 תווים)', price: '₪0.03' },
  { label: 'הודעה / חלון שיחה WhatsApp בחריגה', price: '₪0.15' },
  { label: 'אימייל יוצא', price: '₪0.01' },
  { label: 'שיחת קול AI ידנית (חיוב לפי שנייה)', price: '₪1.00 לדקה' },
  { label: 'מענה ברשת חברתית לחלון 24 שעות', price: '₪0.002' },
  { label: 'הפצת שיחת IVR קולית', price: '₪0.20 לדקה' },
];

function formatIls(n: number): string {
  return `₪${n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CreditBalancePill() {
  // Single source of truth: the credit wallet in the database (get_my_wallet).
  // No localStorage placeholder — a stale cached number desynced the pill from
  // the wallet shown in Billing.
  const { data: wallet, isLoading } = useCreditWallet();
  const balance = Number(wallet?.balance ?? 0);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number>(2500);

  const bonus = Math.max(0, Math.round(amount * 0.1));

  const sendWhatsApp = () => {
    const text = `היי, אשמח להטעין את החשבון שלי ברילטיז נדל"ן ב-${amount} ש"ח לטובת שירותי פרימיום.`;
    const url = `https://wa.me/${SALES_PHONE}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        dir="rtl"
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-black/20 transition hover:brightness-95"
        style={{ backgroundColor: '#fdf251', color: '#1b2a4f' }}
        aria-label="יתרת קרדיטים"
      >
        <Wallet className="h-3.5 w-3.5" />
        <span className="font-bold tabular-nums text-[15px]">{isLoading ? '…' : formatIls(balance)}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-md text-right">
          <DialogHeader className="text-right">
            <DialogTitle>הטענת יתרת קרדיטים</DialogTitle>
            <DialogDescription>
              תעריפי שירותי הפרימיום ליחידה. הטעינה תופעל ידנית מול נציג מכירות בוואטסאפ.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border bg-muted/30 divide-y">
            {RATES.map((r) => (
              <div key={r.label} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-semibold tabular-nums">{r.price}</span>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="topup-amount" className="text-sm">סכום להטענה (₪)</Label>
            <Input
              id="topup-amount"
              type="number"
              min={100}
              step={100}
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
              className="text-right"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">
              בונוס משוער: {formatIls(bonus)} נוספים על הטענה זו.
            </p>
          </div>

          <Button onClick={sendWhatsApp} className="w-full" size="lg">
            שליחת בקשת הטענה ב-WhatsApp
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default CreditBalancePill;
