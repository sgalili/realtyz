import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Wallet, AlertTriangle, ExternalLink } from 'lucide-react';

export type BrightDataBalance = {
  ok: boolean;
  balance?: number;
  pending_costs?: number;
  available?: number;
  currency?: string;
  zone?: string | null;
  token_source?: 'user' | 'project' | null;
  token_masked?: string;
  zone_status?: string | null;
  fetched_at?: string;
  error?: string;
  message?: string;
};

const fmt = (n?: number) =>
  typeof n === 'number' && Number.isFinite(n)
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';

export function BrightDataBalanceWidget({
  data,
  loading,
  onRefresh,
}: {
  data: BrightDataBalance | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const low = data?.ok && typeof data.available === 'number' && data.available < 5;

  return (
    <div className="rounded-lg border bg-muted/30 p-3" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold">יתרת קרדיט Bright Data</span>
          {low && (
            <Badge variant="outline" className="text-amber-700 border-amber-300 gap-1">
              <AlertTriangle className="h-3 w-3" /> יתרה נמוכה
            </Badge>
          )}
          {data?.zone_status === 'active' && (
            <Badge variant="outline" className="text-emerald-700 border-emerald-300">Zone פעיל</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" asChild className="h-7 gap-1 px-2">
          <a href="https://brightdata.com/cp/billing/settings" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="text-xs">טעינת קרדיט</span>
          </a>
        </Button>
        <Button size="sm" variant="ghost" onClick={onRefresh} disabled={loading} className="h-7 gap-1 px-2">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          <span className="text-xs">רענון</span>
        </Button>
        </div>
      </div>

      {data?.ok ? (
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[11px] text-muted-foreground">זמין</div>
            <div className="text-base font-bold tabular-nums" dir="ltr">
              ${fmt(data.available)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">יתרה</div>
            <div className="text-sm font-semibold tabular-nums" dir="ltr">${fmt(data.balance)}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">חיובים בהמתנה</div>
            <div className="text-sm font-semibold tabular-nums" dir="ltr">${fmt(data.pending_costs)}</div>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {loading
            ? 'טוען יתרה…'
            : data?.error === 'missing_token'
              ? 'טוקן Bright Data אינו מוגדר עדיין.'
              : data?.error === 'invalid_token'
                ? 'הטוקן שהוזן אינו תקין מול Bright Data.'
                : data?.message || 'לא ניתן למשוך יתרה כרגע.'}
        </p>
      )}
    </div>
  );
}
