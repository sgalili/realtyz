/**
 * IncomingLeadsPanel
 * ──────────────────
 * Lives inside the Tasks page (משימות). Shows every incoming lead and every
 * scheduled demo of the ACTIVE workspace so the whole intake queue is handled
 * in one place instead of on the dashboard.
 */
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';
import { CalendarClock, ChevronLeft, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { formatPhoneDisplay } from '@/lib/formatPhone';

type Mode = 'leads' | 'demos';

function slotLabel(iso: string | null) {
  if (!iso) return 'מועד שיתואם';
  const d = new Date(iso);
  const day = d.toLocaleDateString('he-IL', { weekday: 'long' });
  const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${date} · ${time}`;
}

export function useIncomingLeadsCount() {
  const ownerId = useActiveWorkspaceOwnerId();
  const { data: leads = 0 } = useQuery({
    queryKey: ['tasks-incoming-leads-count', ownerId],
    enabled: !!ownerId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', ownerId!)
        .gte('created_at', since);
      return count ?? 0;
    },
  });
  return leads;
}

export function useScheduledDemosCount() {
  const ownerId = useActiveWorkspaceOwnerId();
  const { data = 0 } = useQuery({
    queryKey: ['tasks-demos-count', ownerId],
    enabled: !!ownerId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from('demo_requests')
        .select('id', { count: 'exact', head: true });
      return count ?? 0;
    },
  });
  return data;
}

export function IncomingLeadsPanel({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const ownerId = useActiveWorkspaceOwnerId();

  const { data: leads, isLoading: loadingLeads } = useQuery({
    queryKey: ['tasks-incoming-leads', ownerId],
    enabled: !!ownerId && mode === 'leads',
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('leads')
        .select('id, full_name, phone_number, city, interest_tag, lead_stage, status, created_at')
        .eq('assigned_to', ownerId!)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(60);
      return (data ?? []) as any[];
    },
  });

  const { data: demos, isLoading: loadingDemos } = useQuery({
    queryKey: ['tasks-scheduled-demos', ownerId],
    enabled: !!ownerId && mode === 'demos',
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('demo_requests')
        .select('id, first_name, last_name, phone, notes, status, preferred_at, created_at, lead_id')
        .order('preferred_at', { ascending: false })
        .limit(60);
      return (data ?? []) as any[];
    },
  });

  const loading = mode === 'leads' ? loadingLeads : loadingDemos;
  const rows = mode === 'leads' ? leads ?? [] : demos ?? [];

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {mode === 'leads' ? 'אין פניות חדשות כרגע.' : 'אין הדגמות מתוזמנות כרגע.'}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((row: any) => {
        const isLead = mode === 'leads';
        const name = isLead
          ? row.full_name || 'איש קשר חדש'
          : [row.first_name, row.last_name].filter(Boolean).join(' ') || 'מתווך חדש';
        const phone = isLead ? row.phone_number : row.phone;
        const target = isLead ? `/lead-crm/${row.id}` : row.lead_id ? `/lead-crm/${row.lead_id}` : '/lead-crm';
        return (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => navigate(target)}
              className="flex w-full items-start gap-3 rounded-lg border border-border bg-card p-3 text-right transition-colors hover:bg-accent/40"
            >
              {isLead ? (
                <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              ) : (
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              )}
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">{name}</span>
                  {isLead ? (
                    <>
                      {row.interest_tag && <Badge variant="secondary" className="text-[13px]">{row.interest_tag}</Badge>}
                      {row.city && <span className="text-[13px] text-muted-foreground">{row.city}</span>}
                    </>
                  ) : (
                    <Badge variant="secondary" className="text-[13px]">
                      {slotLabel(row.preferred_at)}
                    </Badge>
                  )}
                  {phone && (
                    <span className="text-[13px] text-muted-foreground">{formatPhoneDisplay(phone)}</span>
                  )}
                </span>
                <span className="block text-[13px] text-muted-foreground">
                  {row.created_at ? formatDistanceToNow(new Date(row.created_at), { addSuffix: true, locale: he }) : ''}
                  {!isLead && row.notes ? ` · ${row.notes}` : ''}
                </span>
              </span>
              <ChevronLeft className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/50" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default IncomingLeadsPanel;
