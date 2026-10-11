import { AlertTriangle, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCreditWallet } from '@/hooks/useSubscription';
import { cn } from '@/lib/utils';

/** Wallet balance at the top of the sidebar for every account type; opens /wallet. */
export function SidebarWalletIndicator() {
  const navigate = useNavigate();
  const { data, isLoading } = useCreditWallet();
  const balance = Number(data?.balance ?? 0);
  const locked = !!data?.lockedAt;
  return (
    <button
      type="button"
      onClick={() => navigate('/wallet')}
      className={cn(
        'mx-3 mb-3 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-right transition-colors',
        locked ? 'border-destructive/50 bg-destructive/10' : 'border-border bg-card hover:border-primary',
      )}
      aria-label="ארנק ותשלומים"
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        {locked ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <Wallet className="h-4 w-4 text-primary" />}
        {locked ? 'נדרש תשלום' : 'ארנק'}
      </span>
      <bdi dir="ltr" className={cn('text-base font-bold', balance <= 0 && 'text-destructive')}>
        {isLoading ? '…' : `₪${Math.round(balance).toLocaleString('he-IL')}`}
      </bdi>
    </button>
  );
}
