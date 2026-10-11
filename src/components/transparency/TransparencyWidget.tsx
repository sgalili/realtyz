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

function Stat({ label, value, tone, active, onClick }: { label: string; value: string; tone?: 'success' | 'warning' | 'destructive'; active?: boolean; onClick?: () => void }) {
  const color = tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : tone === 'destructive' ? 'text-destructive' : 'text-foreground';
  return <button type="button" onClick={onClick} aria-pressed={active} className={`min-w-0 rounded-md border bg-background p-2 text-center transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'border-primary ring-1 ring-primary bg-primary/5' : ''}`}><p className={`text-lg font-bold ${color}`}>{value}</p><p className="truncate text-xs text-muted-foreground">{label}</p></button>;
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
  const a = data.advertiser, p = data.partner;
  const isPartner = Number(p.promoted_listings) > 0;
  return (
    <section className="space-y-3 rounded-lg border bg-card p-3" aria-label="שקיפות">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold">שקיפות</h2>
        {data.trust_score != null && <span className="text-xs text-muted-foreground">ציון אמינות <b className="text-foreground">{n(data.trust_score)}</b></span>}
      </div>
      {data.banned && <p role="alert" className="flex items-center gap-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive"><ShieldAlert className="h-4 w-4" />החשבון מושעה. המודעות, ההפצה והארנק הוקפאו.</p>}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Stat label="נכסים פעילים" value={n(a.active_listings)} {...on('advertiser', 'active_listings')} />
        <Stat label="פניות שלי (30 יום)" value={n(a.leads_30d)} {...on('advertiser', 'leads_30d')} />
        <Stat label="פניות שלי מאושרות" value={n(a.approved)} tone="success" {...on('advertiser', 'approved')} />
        <Stat label="פניות שלי במחלוקת" value={n(a.disputed)} tone="warning" {...on('advertiser', 'disputed')} />
        <Stat label="פניות שלי נדחו" value={n(a.rejected)} tone="destructive" {...on('advertiser', 'rejected')} />
        <Stat label={data.wallet?.frozen ? 'יתרה (מוקפאת)' : 'יתרת ארנק'} value={fmtCredits(ilsToCredits(Number(data.wallet?.balance ?? 0)))} tone={data.wallet?.frozen ? 'destructive' : undefined} {...on('advertiser', 'wallet')} />
      </div>
      {isPartner && <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        <Stat label="נכסים שאני מקדם" value={n(p.promoted_listings)} {...on('partner', 'promoted_listings')} />
        <Stat label="פניות משותפים (30 יום)" value={n(p.leads_30d)} {...on('partner', 'leads_30d')} />
        <Stat label="פניות משותפים מאושרות" value={n(p.approved)} tone="success" {...on('partner', 'approved')} />
        <Stat label="פניות משותפים במחלוקת" value={n(p.disputed)} tone="warning" {...on('partner', 'disputed')} />
        <Stat label="פניות משותפים נדחו" value={n(p.rejected)} tone="destructive" {...on('partner', 'rejected')} />
      </div>}
      {Number(data.pending_disputes_value) > 0 && <p className="text-xs text-muted-foreground">יתרה בבירור במחלוקות פתוחות: {fmtCredits(ilsToCredits(Number(data.pending_disputes_value)))}</p>}
    </section>
  );
}
