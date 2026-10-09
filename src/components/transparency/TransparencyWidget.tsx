import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';

type Side = Record<string, number>;
type Summary = { advertiser: Side; partner: Side; wallet: { balance: number; frozen: boolean } | null; pending_disputes_value: number; banned: boolean; trust_score: number | null };

const n = (v: unknown) => Number(v ?? 0).toLocaleString('he-IL');

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warning' | 'destructive' }) {
  const color = tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : tone === 'destructive' ? 'text-destructive' : 'text-foreground';
  return <div className="min-w-0 rounded-md border bg-background p-2 text-center"><p className={`text-lg font-bold ${color}`}>{value}</p><p className="truncate text-xs text-muted-foreground">{label}</p></div>;
}

/** Transparent view of properties, inquiries, dispute outcomes and wallet for advertisers and partners. */
export default function TransparencyWidget() {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { data } = useQuery({
    queryKey: ['transparency', user?.id, activeWorkspaceId], enabled: !!user?.id, refetchInterval: 60_000,
    queryFn: async () => { const { data, error } = await supabase.rpc('get_transparency_summary'); if (error) throw error; return data as unknown as Summary; },
  });
  if (!data) return null;
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
        <Stat label="נכסים פעילים" value={n(a.active_listings)} />
        <Stat label="פניות (30 יום)" value={n(a.leads_30d)} />
        <Stat label="פניות מאושרות" value={n(a.approved)} tone="success" />
        <Stat label="במחלוקת" value={n(a.disputed)} tone="warning" />
        <Stat label="נדחו" value={n(a.rejected)} tone="destructive" />
        <Stat label={data.wallet?.frozen ? 'יתרה (מוקפאת)' : 'יתרת ארנק'} value={`₪${n(data.wallet?.balance)}`} tone={data.wallet?.frozen ? 'destructive' : undefined} />
      </div>
      {isPartner && <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        <Stat label="נכסים שאני מקדם" value={n(p.promoted_listings)} />
        <Stat label="פניות שהבאתי (30 יום)" value={n(p.leads_30d)} />
        <Stat label="מאושרות" value={n(p.approved)} tone="success" />
        <Stat label="במחלוקת" value={n(p.disputed)} tone="warning" />
        <Stat label="נדחו" value={n(p.rejected)} tone="destructive" />
      </div>}
      {Number(data.pending_disputes_value) > 0 && <p className="text-xs text-muted-foreground">סכום בבירור במחלוקות פתוחות: ₪{n(data.pending_disputes_value)}</p>}
    </section>
  );
}
