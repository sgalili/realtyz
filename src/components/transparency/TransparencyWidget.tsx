import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, House, ShieldCheck, MessageSquare, type LucideIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { fmtCredits, ilsToCredits } from '@/lib/credits';
import { Button } from '@/components/ui/button';

type Side = Record<string, number>;
type Summary = { advertiser: Side; partner: Side; wallet: { balance: number; frozen: boolean } | null; pending_disputes_value: number; banned: boolean; trust_score: number | null };

const n = (v: unknown) => Number(v ?? 0).toLocaleString('he-IL');

export type TransparencyFilter = { side: 'advertiser' | 'partner'; key: 'active_listings' | 'promoted_listings' | 'leads_30d' | 'approved' | 'disputed' | 'rejected' | 'wallet' };

function Stat({ label, value, icon: Icon, iconClass, tone, active, onClick }: { label: string; value: string; icon: LucideIcon; iconClass?: string; tone?: 'destructive'; active?: boolean; onClick?: () => void }) {
  const content = <><Icon className={`!h-7 !w-7 shrink-0 ${iconClass ?? 'text-muted-foreground'}`} aria-hidden="true" /><span className="text-[13px] font-normal leading-5 text-muted-foreground">{label}</span><span dir="rtl" className={`block max-w-full text-center whitespace-normal break-words text-[22px] font-semibold leading-7 tabular-nums ${tone === 'destructive' ? 'text-destructive' : 'text-foreground'}`}>{value}</span></>;
  const className = `flex h-auto min-h-[88px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-md px-4 py-3 text-center whitespace-normal ${active ? 'bg-accent ring-1 ring-inset ring-border' : ''}`;
  return onClick ? <Button type="button" variant="ghost" onClick={onClick} aria-pressed={!!active} className={className}>{content}</Button> : <div className={className}>{content}</div>;
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
    <Stat key="active" icon={House} iconClass="text-primary" label="נכסים פעילים" value={n(a.active_listings)} {...on('advertiser', 'active_listings')} />,
    <Stat key="trust" icon={ShieldCheck} iconClass="text-success" label="ציון אמינות" value={data.trust_score != null ? n(data.trust_score) : '—'} />,
    <Stat key="leads" icon={MessageSquare} iconClass="text-social-facebook" label="פניות · 30 יום" value={n(a.leads_30d)} {...on('advertiser', 'leads_30d')} />,
  ];
  return (
    <section className="space-y-2" aria-label="סיכום">
      {data.banned && <p role="alert" className="flex items-center gap-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive"><ShieldAlert className="h-4 w-4" />החשבון מושעה. המודעות, ההפצה והארנק הוקפאו.</p>}
      <div className="grid grid-cols-3 gap-x-2 border-y border-border/60 py-3">{stats}</div>
      {Number(data.pending_disputes_value) > 0 && <p className="text-xs text-muted-foreground">יתרה בבירור במחלוקות פתוחות: {fmtCredits(ilsToCredits(Number(data.pending_disputes_value))).replace('קרדיטים', 'קר׳')}</p>}
    </section>
  );
}
