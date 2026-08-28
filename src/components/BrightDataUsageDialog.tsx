/**
 * Detailed Bright Data usage & cost breakdown (Hebrew RTL).
 * Opened from the header balance badge. Shows the wallet state, per-line
 * itemized charges, the most expensive operations and a top-up shortcut.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Loader2, RefreshCw, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TOPUP_URL } from '@/components/BrightDataHeroPill';

type LineItem = {
  date: string | null;
  zone: string | null;
  requests: number | null;
  bytes: number | null;
  cost: number | null;
  label: string;
};

type UsageResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  zone?: string | null;
  from?: string;
  to?: string;
  endpoint?: string | null;
  items?: LineItem[];
  totals?: { cost: number; requests: number; bytes: number };
  local_ops?: Array<{ day: string; kind: string; count: number }>;
};

type BalanceResponse = {
  ok?: boolean;
  balance?: number;
  available?: number;
  pending_costs?: number;
  zone?: string | null;
  zone_status?: string | null;
};

const usd = (n?: number | null) =>
  typeof n === 'number' && Number.isFinite(n)
    ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';

const int = (n?: number | null) =>
  typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-US') : '—';

const gb = (bytes?: number | null) => {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
};

export function BrightDataUsageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const balanceQ = useQuery({
    queryKey: ['brightdata-balance-detail'],
    enabled: open,
    staleTime: 60_000,
    queryFn: async (): Promise<BalanceResponse | null> => {
      const { data } = await supabase.functions.invoke('brightdata-balance', { body: {} });
      return (data ?? null) as BalanceResponse | null;
    },
  });

  const usageQ = useQuery({
    queryKey: ['brightdata-usage', 30],
    enabled: open,
    staleTime: 60_000,
    queryFn: async (): Promise<UsageResponse | null> => {
      const { data } = await supabase.functions.invoke('brightdata-usage', { body: { days: 30 } });
      return (data ?? null) as UsageResponse | null;
    },
  });

  const items = usageQ.data?.items ?? [];

  /** Grouped per zone/label so the priciest operation is obvious. */
  const byOperation = useMemo(() => {
    const map = new Map<string, { label: string; cost: number; requests: number; bytes: number }>();
    for (const it of items) {
      const key = `${it.zone ?? '-'}|${it.label}`;
      const cur = map.get(key) ?? { label: `${it.zone ?? ''} ${it.label}`.trim(), cost: 0, requests: 0, bytes: 0 };
      cur.cost += it.cost ?? 0;
      cur.requests += it.requests ?? 0;
      cur.bytes += it.bytes ?? 0;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost);
  }, [items]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0) || String(b.date).localeCompare(String(a.date))),
    [items],
  );

  const loading = usageQ.isLoading || balanceQ.isLoading;
  const totals = usageQ.data?.totals;
  const balance = balanceQ.data?.balance ?? balanceQ.data?.available;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-right">
            <TrendingUp className="h-4 w-4 text-primary" />
            צריכה ועלויות Bright Data (Yad2)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Wallet summary */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryTile label="יתרה בארנק" value={usd(balance)} />
            <SummaryTile label="חיובים בהמתנה" value={usd(balanceQ.data?.pending_costs)} />
            <SummaryTile label="עלות 30 יום" value={usd(totals?.cost)} />
            <SummaryTile label="קריאות 30 יום" value={int(totals?.requests)} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { balanceQ.refetch(); usageQ.refetch(); }}
              disabled={loading}
            >
              {loading ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="ml-1 h-3.5 w-3.5" />}
              רענון
            </Button>
            <Button size="sm" asChild>
              <a href={TOPUP_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
                טעינת קרדיט
              </a>
            </Button>
            {usageQ.data?.zone && <Badge variant="secondary">Zone: {usageQ.data.zone}</Badge>}
            {usageQ.data?.from && (
              <span className="text-[11px] text-muted-foreground" dir="ltr">
                {usageQ.data.from} → {usageQ.data.to}
              </span>
            )}
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              טוען נתוני צריכה...
            </div>
          )}

          {/* Most expensive operations */}
          {!loading && byOperation.length > 0 && (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold">הפעולות היקרות ביותר</h4>
              <div className="space-y-1">
                {byOperation.slice(0, 6).map((op, i) => (
                  <div
                    key={`${op.label}-${i}`}
                    className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-[13px]"
                  >
                    <span className="truncate">{op.label || 'פעולה'}</span>
                    <span className="flex items-center gap-3 tabular-nums" dir="ltr">
                      <span className="text-muted-foreground">{int(op.requests)} req</span>
                      <span className="text-muted-foreground">{gb(op.bytes)}</span>
                      <span className="font-semibold">{usd(op.cost)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Line-by-line itemized charges */}
          {!loading && sortedItems.length > 0 && (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold">פירוט חיובים שורה-שורה</h4>
              <div className="overflow-x-auto rounded-md border border-border/60">
                <table className="w-full text-[12px]">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 text-right">תאריך</th>
                      <th className="px-2 py-1.5 text-right">Zone / סוג</th>
                      <th className="px-2 py-1.5 text-right">קריאות</th>
                      <th className="px-2 py-1.5 text-right">תעבורה</th>
                      <th className="px-2 py-1.5 text-right">עלות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.map((it, i) => (
                      <tr key={i} className="border-t border-border/50">
                        <td className="px-2 py-1.5 tabular-nums" dir="ltr">{it.date ?? '—'}</td>
                        <td className="px-2 py-1.5">{[it.zone, it.label].filter(Boolean).join(' · ')}</td>
                        <td className="px-2 py-1.5 tabular-nums" dir="ltr">{int(it.requests)}</td>
                        <td className="px-2 py-1.5 tabular-nums" dir="ltr">{gb(it.bytes)}</td>
                        <td className="px-2 py-1.5 font-semibold tabular-nums" dir="ltr">{usd(it.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {!loading && sortedItems.length === 0 && (
            <p className="rounded-md border border-border/60 bg-muted/30 p-3 text-[12px] text-muted-foreground">
              {usageQ.data?.message ||
                'ה־API של Bright Data לא החזיר פירוט חיובים עבור החשבון הזה. היתרה מוצגת למעלה, והפירוט המלא זמין בדף החיוב של Bright Data.'}
            </p>
          )}

          {/* Local operation counters — always available */}
          {!loading && (usageQ.data?.local_ops?.length ?? 0) > 0 && (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold">פעולות מערכת (30 יום)</h4>
              <div className="space-y-1">
                {usageQ.data!.local_ops!.slice(0, 12).map((op, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md bg-muted/20 px-3 py-1.5 text-[12px]">
                    <span className="truncate">{op.kind}</span>
                    <span className="flex items-center gap-3 tabular-nums" dir="ltr">
                      <span className="text-muted-foreground">{op.day}</span>
                      <span className="font-semibold">{int(op.count)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-2 text-center">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold tabular-nums" dir="ltr">{value}</p>
    </div>
  );
}

export default BrightDataUsageDialog;
