import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useCreditWallet } from '@/hooks/useSubscription';
import { getCreditsPerIls, subscribeCreditRate } from '@/lib/credits';
import { WALLET_BONUS_TIERS, walletPackage } from '../../../supabase/functions/_shared/walletPackage';

const EVENT = 'toraff:credits-upgrade';
/** Open the upgrade prompt from anywhere, e.g. after a server "insufficient credits" refusal. */
export const openCreditsUpgrade = () => window.dispatchEvent(new Event(EVENT));

export function CreditsUpgradeDialog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: wallet } = useCreditWallet();
  const rate = useSyncExternalStore(subscribeCreditRate, getCreditsPerIls, getCreditsPerIls);
  const [open, setOpen] = useState(false);

  useEffect(() => { const h = () => setOpen(true); window.addEventListener(EVENT, h); return () => window.removeEventListener(EVENT, h); }, []);
  const empty = !!user && wallet != null && Number(wallet.balance ?? 0) <= 0;
  useEffect(() => {
    if (!empty || !user) return;
    const key = `toraff-credits-upgrade-shown:${user.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    setOpen(true);
  }, [empty, user]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>נגמרו הקרדיטים החינמיים</DialogTitle>
          <DialogDescription>כל חודש מקבלים 20 קרדיטים חינם. כדי להמשיך לפרסם ולשלוח עכשיו, בחרו חבילה. ככל שהחבילה גדולה יותר, הבונוס גדל.</DialogDescription>
        </DialogHeader>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {WALLET_BONUS_TIERS.map(t => { const p = walletPackage(t.amount, rate); return (
            <li key={t.amount}><button type="button" onClick={() => { setOpen(false); navigate(`/wallet?amount=${t.amount}`); }}
              className="w-full rounded-lg border border-border bg-card p-3 text-center hover:border-primary">
              <p className="text-lg font-bold tabular-nums">₪{t.amount.toLocaleString('he-IL')}</p>
              <p className="text-sm tabular-nums text-muted-foreground">{p.credits.toLocaleString('he-IL')} קרדיטים</p>
              <p className="min-h-5 text-sm font-semibold text-success">{t.percent ? `${t.percent}% בונוס` : 'ללא בונוס'}</p>
            </button></li>); })}
        </ul>
        <div className="flex justify-between gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>אחר כך</Button>
          <Button onClick={() => { setOpen(false); navigate('/wallet'); }}>לרכישת קרדיטים</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
