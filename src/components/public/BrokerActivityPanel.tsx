import { lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, CalendarClock, MessageCircle, Megaphone, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { TERMINAL_LISTING_STATUSES } from '@/lib/publicationSettings';

const LeadCRM = lazy(() => import('@/pages/LeadCRM'));

type Listing = { id: string; property_title: string | null; address: string | null; city: string | null; asking_price: number | null; deal_type: string | null };

/** Brokers-only activity: own workspace inventory, leads and shortcuts. No partner or board metrics. */
export function useBrokerActivityCounts(owner: string | null | undefined) {
  return useQuery({
    queryKey: ['broker-activity-counts', owner], enabled: !!owner, staleTime: 5 * 60_000,
    queryFn: async () => {
      const ws = owner as string;
      const [listings, leads, meetings] = await Promise.all([
        supabase.from('listings').select('id', { count: 'exact', head: true }).eq('workspace_owner_id', ws).is('canonical_duplicate_of', null).not('status', 'in', `(${TERMINAL_LISTING_STATUSES.join(',')})`),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('workspace_owner_id', ws),
        supabase.from('meetings').select('id', { count: 'exact', head: true }).eq('workspace_owner_id', ws).gte('starts_at', new Date().toISOString()),
      ]);
      return { listings: listings.count ?? 0, leads: leads.count ?? 0, meetings: meetings.count ?? 0 };
    },
  });
}

export function BrokerActivityProperties({ owner, onNavigate }: { owner: string; onNavigate: () => void }) {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['broker-activity-listings', owner], staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('listings').select('id,property_title,address,city,asking_price,deal_type').eq('workspace_owner_id', owner).is('canonical_duplicate_of', null).not('status', 'in', `(${TERMINAL_LISTING_STATUSES.join(',')})`).order('updated_at', { ascending: false }).limit(20);
      if (error) throw error; return (data ?? []) as Listing[];
    },
  });
  if (q.isError) return <p role="alert" className="py-8 text-center text-destructive">לא ניתן לטעון את הנכסים כרגע</p>;
  if (!q.isSuccess) return <p role="status" className="py-8 text-center text-muted-foreground">טוען נכסים…</p>;
  if (!q.data.length) return <p className="py-8 text-center text-muted-foreground">עדיין אין נכסים במאגר</p>;
  return <div className="divide-y">
    {q.data.map(l => <button key={l.id} type="button" className="flex w-full items-center justify-between gap-3 py-3 text-right text-sm hover:bg-muted/50" onClick={() => { onNavigate(); navigate('/properties'); }}>
      <span className="min-w-0"><span className="block truncate font-semibold">{l.property_title || [l.address, l.city].filter(Boolean).join(', ') || 'נכס ללא כותרת'}</span><span className="block truncate text-xs text-muted-foreground">{[l.deal_type === 'rent' ? 'השכרה' : 'מכירה', l.city].filter(Boolean).join(' · ')}</span></span>
      {l.asking_price ? <bdi className="shrink-0 tabular-nums">₪{Number(l.asking_price).toLocaleString('he-IL')}{l.deal_type === 'rent' ? ' / לחודש' : ''}</bdi> : null}
    </button>)}
  </div>;
}

export function BrokerActivityLeads({ userId, owner }: { userId: string; owner: string }) {
  return <LeadCRM key={`${userId}:${owner}`} activityOnly />;
}

export function BrokerActivityShortcuts({ owner, onNavigate }: { owner: string; onNavigate: () => void }) {
  const navigate = useNavigate();
  const counts = useBrokerActivityCounts(owner).data;
  const items = [
    { icon: Building2, label: 'הנכסים שלי', value: counts?.listings, to: '/properties' },
    { icon: Users, label: 'לידים', value: counts?.leads, to: '/lead-crm' },
    { icon: MessageCircle, label: 'צ׳אטים', to: '/inbox' },
    { icon: Megaphone, label: 'קמפיינים', to: '/campaigns' },
    { icon: CalendarClock, label: 'סיורים ושיחות קרובים', value: counts?.meetings, to: '/command-center' },
  ];
  return <div className="grid grid-cols-2 gap-2 py-3">
    {items.map(({ icon: Icon, label, value, to }) => <button key={to} type="button" onClick={() => { onNavigate(); navigate(to); }} className="flex items-center gap-2 rounded-lg border border-border p-3 text-right text-sm hover:bg-muted/50">
      <Icon className="h-5 w-5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {value !== undefined && <span className="shrink-0 font-bold tabular-nums">{value.toLocaleString('he-IL')}</span>}
    </button>)}
  </div>;
}
