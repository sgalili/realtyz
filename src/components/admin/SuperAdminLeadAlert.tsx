import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { toast } from 'sonner';
import { Bell, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';

const QUERY_KEY = ['admin-leads', 'new-count'];
const SEEN_TS_STORAGE_KEY = 'kalpiz-admin-leads-last-seen';

interface AdminLeadRow {
  id: string;
  user_email: string | null;
  attempted_target: number | null;
  current_target: number | null;
  election_type: string | null;
  created_at: string;
}

/**
 * Super-admin-only sidebar alert that surfaces new upgrade-interest leads.
 * - Subscribes to realtime inserts on `admin_leads`.
 * - Pops a sonner toast on each new lead.
 * - Renders a pulsing badge linking to /super-admin?tab=leads.
 *
 * Renders nothing (and skips realtime/queries) for non-super-admins.
 */
export function SuperAdminLeadAlert({ collapsed }: { collapsed?: boolean }) {
  const { isSuperAdmin } = useUserRole();
  const queryClient = useQueryClient();
  const lastSeenAtRef = useRef<number>(readSeenAt());
  const [, force] = useState(0);

  const { data: newCount = 0 } = useQuery({
    queryKey: QUERY_KEY,
    enabled: isSuperAdmin,
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      const sinceIso = new Date(lastSeenAtRef.current as number).toISOString();
      const { count } = await supabase
        .from('admin_leads')
        .select('id', { count: 'exact', head: true })
        .eq('lead_type', 'upgrade_interest')
        .gt('created_at', sinceIso);
      return count ?? 0;
    },
  });

  // Realtime subscription: toast + invalidate count on new insert.
  useEffect(() => {
    if (!isSuperAdmin) return;
    const channel = supabase
      .channel('admin-leads-watch')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_leads' },
        (payload) => {
          const row = payload.new as AdminLeadRow;
          const email = row.user_email ?? 'משתמש לא מזוהה';
          const attempted = row.attempted_target ?? '?';
          const isPrimaries = row.election_type === 'primaries';
          const unit = isPrimaries ? 'מושבים' : 'מנדטים';
          toast.success('🎯 ליד שדרוג חדש', {
            description: `${email} מתעניין ב-${attempted} ${unit}`,
            duration: 7000,
          });
          queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isSuperAdmin, queryClient]);

  if (!isSuperAdmin) return null;

  const handleClick = () => {
    const now = Date.now();
    lastSeenAtRef.current = now;
    try {
      window.localStorage.setItem(SEEN_TS_STORAGE_KEY, String(now));
    } catch {
      /* ignore */
    }
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    force((n) => n + 1);
  };

  return (
    <NavLink
      to="/super-admin"
      onClick={handleClick}
      className="group relative flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-primary hover:bg-primary/10"
      aria-label={newCount > 0 ? `${newCount} לידים חדשים` : 'ניטור לידים'}
      title={newCount > 0 ? `${newCount} לידי שדרוג חדשים` : 'אין לידים חדשים'}
    >
      <span className="relative inline-flex">
        <Bell className="h-4 w-4 text-warning" aria-hidden="true" />
        {newCount > 0 && (
          <>
            <span className="absolute -right-1 -top-1 inline-flex h-2.5 w-2.5 rounded-full bg-warning opacity-70 animate-ping" />
            <span className="absolute -right-1 -top-1 inline-flex h-2.5 w-2.5 rounded-full bg-warning" />
          </>
        )}
      </span>
      {!collapsed && (
        <span className="flex flex-1 items-center gap-1.5 font-semibold">
          <Sparkles className="h-3 w-3 text-gold" />
          לידי שדרוג
          {newCount > 0 && (
            <span className="ms-auto rounded-full bg-warning px-2 py-0.5 text-[10px] font-bold leading-none text-warning-foreground">
              {newCount > 99 ? '99+' : newCount}
            </span>
          )}
        </span>
      )}
    </NavLink>
  );
}

function readSeenAt(): number {
  if (typeof window === 'undefined') return Date.now() - 7 * 24 * 60 * 60 * 1000;
  const raw = window.localStorage.getItem(SEEN_TS_STORAGE_KEY);
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed)) {
    // First load: show the past 24h as "new" so admin sees activity.
    return Date.now() - 24 * 60 * 60 * 1000;
  }
  return parsed;
}
