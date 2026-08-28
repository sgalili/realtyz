/**
 * Compact Bright Data credit balance pill for the blue hero (wave) strip.
 * Reads the live balance through the `brightdata-balance` edge function.
 */
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Loader2, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type BalanceResponse = {
  ok?: boolean;
  available?: number;
  balance?: number;
  currency?: string;
};

const fmt = (n?: number) =>
  typeof n === 'number' && Number.isFinite(n)
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : null;

const CACHE_KEY = 'realtyz:brightdata:balance';

/** Direct Bright Data top-up billing flow (opens in a new tab). */
export const TOPUP_URL =
  'https://brightdata.com/cp/billing_flow?id=hl_2432c380&type=top_up';

/** Last known balance, so the pill NEVER blanks out between refreshes. */
function readCache(): BalanceResponse | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as BalanceResponse) : null;
  } catch {
    return null;
  }
}

export function BrightDataHeroPill() {
  const { data, isLoading } = useQuery({
    queryKey: ['brightdata-balance-hero'],
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    // Persisted last-known value keeps the pill on screen permanently.
    placeholderData: readCache() ?? undefined,
    queryFn: async (): Promise<BalanceResponse | null> => {
      const { data, error } = await supabase.functions.invoke('brightdata-balance', { body: {} });
      // A failed probe must never remove the pill: fall back to the cache.
      if (error) return readCache();
      const next = (data ?? null) as BalanceResponse | null;
      const value = next?.available ?? next?.balance;
      if (typeof value === 'number' && Number.isFinite(value)) {
        try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      }
      return readCache() ?? next;
    },
  });

  const amount = fmt(data?.available ?? data?.balance);
  // The pill is permanent — with no value yet we still render it (as a
  // clickable top-up shortcut) instead of disappearing.
  const low = typeof (data?.available ?? data?.balance) === 'number' && (data?.available ?? data?.balance)! < 5;

  return (
    <a
      dir="rtl"
      href={TOPUP_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="יתרת ארנק Bright Data — לחצו לטעינת קרדיט"
      aria-label="יתרת ארנק Bright Data — פתיחת דף טעינת הקרדיט"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[12px] font-semibold text-white/90 underline decoration-white/40 decoration-dotted underline-offset-4 transition-colors hover:text-white hover:decoration-white',
        low && 'text-amber-200 decoration-amber-300/70',
      )}
    >
      <Wallet className="h-3.5 w-3.5" />
      <span>יתרה</span>
      {amount ? (
        <span dir="ltr" className="tabular-nums">{`$${amount}`}</span>
      ) : isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <span dir="ltr" className="tabular-nums">—</span>
      )}
      <ExternalLink className="h-3 w-3 opacity-70" />
    </a>
  );

}
