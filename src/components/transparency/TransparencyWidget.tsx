import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { fmtCredits, ilsToCredits } from '@/lib/credits';

type Side = Record<string, number>;
type Summary = { advertiser: Side; partner: Side; wallet: { balance: number; frozen: boolean } | null; pending_disputes_value: number; banned: boolean; trust_score: number | null };

const n = (v: unknown) => Number(v ?? 0).toLocaleString('he-IL');

export type TransparencyFilter = { side: 'advertiser' | 'partner'; key: 'active_listings' | 'promoted_listings' | 'leads_30d' | 'approved' | 'disputed' | 'rejected' | 'wallet' };

function Stat({ label, value, tone, active, onClick }: { label: string; value: string; tone?: 'destructive'; active?: boolean; onClick?: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={`min-w-0 px-1 py-1 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md ${active ? 'text-primary' : ''}`}><p className={`truncate text-base font-bold tabular-nums ${tone === 'destructive' ? 'text-destructive' : active ? 'text-primary' : 'text-foreground'}`}>{value}</p><p className="truncate text-[11px] leading-tight text-muted-foreground">{label}</p></button>;
}

/** Transparent view of properties, inquiries, dispute outcomes and wallet for advertisers and partners. */
export default function TransparencyWidget({ filter, onFilter }: { filter?: TransparencyFilter | null; onFilter?: (f: TransparencyFilter | null) => void }) {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { data } = useQuery({
    queryKey: ['transparency', user?.id, activeWorkspaceId], enabled: !!user?.id, refetchInterval: 60_000,
    queryFn: async () => { const { data, error } = await supabase.rpc('get_transparency_summary'); if (error) throw error; return data as unknown as Summary; },
  });
  if (!data) return null;
  const on = (side: TransparencyFilter['side'], key: TransparencyFilter['key']) => ({ active: filter?.side === side && filter?.key === key, onClick: () => onFilter?.(filter?.side === side && filter?.key === key ? null : { side, key }) });
  const a = data.advertiser;
  const stats = [
    <Stat key="wallet" label={data.wallet?.frozen ? 'ארנק (מוקפא)' : 'ארנק'} value={fmtCredits(ilsToCredits(Number(data.wallet?.balance ?? 0)))} tone={data.wallet?.frozen ? 'destructive' : undefined} {...on('advertiser', 'wallet')} />,
    <Stat key="active" label="נכסים פעילים" value={n(a.active_listings)} {...on('advertiser', 'active_listings')} />,
    <Stat key="trust" label="ציון אמינות" value={data.trust_score != null ? n(data.trust_score) : '—'} />,
    <Stat key="leads" label="סה״כ פניות" value={n(a.leads_30d)} {...on('advertiser', 'leads_30d')} />,
  ];
  return (
    <section className="space-y-2" aria-label="סיכום">
      {data.banned && <p role="alert" className="flex items-center gap-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive"><ShieldAlert className="h-4 w-4" />החשבון מושעה. המודעות, ההפצה והארנק הוקפאו.</p>}
      <div className="grid grid-cols-4 divide-x divide-x-reverse divide-border/60">{stats}</div>
      {Number(data.pending_disputes_value) > 0 && <p className="text-xs text-muted-foreground">יתרה בבירור במחלוקות פתוחות: {fmtCredits(ilsToCredits(Number(data.pending_disputes_value)))}</p>}
    </section>
  );
}
