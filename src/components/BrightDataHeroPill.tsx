/**
 * Compact Bright Data credit balance pill for the blue hero (wave) strip.
 * Reads the live balance through the `brightdata-balance` edge function.
 */
import { useQuery } from '@tanstack/react-query';
import { Loader2, Wallet } from 'lucide-react';
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

export function BrightDataHeroPill() {
  const { data, isLoading } = useQuery({
    queryKey: ['brightdata-balance-hero'],
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    queryFn: async (): Promise<BalanceResponse | null> => {
      const { data, error } = await supabase.functions.invoke('brightdata-balance', { body: {} });
      if (error) return null;
      return (data ?? null) as BalanceResponse | null;
    },
  });

  const amount = fmt(data?.available ?? data?.balance);
  if (!isLoading && !amount) return null;

  const low = typeof (data?.available ?? data?.balance) === 'number' && (data?.available ?? data?.balance)! < 5;

  return (
    <div
      dir="rtl"
      title="יתרת קרדיט Bright Data"
      className={cn(
        'hidden items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[12px] font-semibold text-white sm:flex',
        low && 'border-amber-300/70 text-amber-200',
      )}
    >
      <Wallet className="h-3.5 w-3.5" />
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <span>{`$${amount}`}</span>
      )}
    </div>
  );
}
