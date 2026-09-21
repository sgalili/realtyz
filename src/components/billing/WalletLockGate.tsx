// Hard wallet gate.
//
// Partner leads are charged to the publisher's wallet the moment they arrive.
// If the wallet goes negative the whole app is locked behind an immediate
// top-up prompt until the balance is settled.
import { Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCreditWallet } from '@/hooks/useSubscription';

const SALES_PHONE = '972546811841';

function formatIls(n: number): string {
  return `₪${n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function WalletLockGate() {
  const { data: wallet } = useCreditWallet();
  const balance = Number(wallet?.balance ?? 0);
  if (balance >= 0) return null;

  const due = Math.abs(balance);
  const text = `היי, אשמח להסדיר את יתרת החשבון שלי ברילטיז בסך ${due} ש"ח ולהמשיך לקבל לידים.`;

  return (
    <div dir="rtl" className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 p-5 backdrop-blur">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 text-center shadow-xl">
        <Wallet className="mx-auto h-10 w-10 text-warning" />
        <h2 className="text-xl font-bold">נדרשת הטענת יתרה</h2>
        <p className="text-sm text-muted-foreground">
          היתרה בארנק אינה מכסה את עמלות הלידים שהתקבלו. יש להסדיר{' '}
          <bdi dir="ltr" className="font-semibold">{formatIls(due)}</bdi> כדי להמשיך להשתמש במערכת.
        </p>
        <div className="flex flex-col gap-2">
          <Button onClick={() => window.open(`https://wa.me/${SALES_PHONE}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')}>
            הטענת יתרה עכשיו
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>שילמתי, רענון</Button>
        </div>
      </div>
    </div>
  );
}

export default WalletLockGate;
