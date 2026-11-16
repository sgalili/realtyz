import { useEffect, useRef, useState } from 'react';
import { safeChannel, removeChannelSafe } from '@/lib/safeRealtime';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';

const QUERY_KEY = ['admin-leads', 'new-count'];
const SEEN_TS_STORAGE_KEY = 'realtyz-admin-leads-last-seen';

interface AdminLeadRow {
  id: string;
  user_email: string | null;
  attempted_target: number | null;
  current_target: number | null;
  created_at: string;
}

/** Global Super Admin shortcut: its alert count never follows the active workspace. */
export function SuperAdminLeadAlert({ onNavigate }: { onNavigate?: () => void }) {
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

  useEffect(() => {
    if (!isSuperAdmin) return;
    const channel = safeChannel('admin-leads-watch')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_leads' },
        (payload) => {
          const row = payload.new as AdminLeadRow;
          const email = row.user_email ?? 'משתמש לא מזוהה';
          const attempted = row.attempted_target ?? '?';
          toast.success('🎯 ליד שדרוג חדש', {
            description: `${email} ליד ב-${attempted} עסקאות`,
            duration: 7000,
          });
          queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        },
      )
      .subscribe();
    return () => {
      removeChannelSafe(channel);
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
    onNavigate?.();
  };

  return (
    <NavLink
      to="/super-admin"
      data-super-admin-shortcut
      onClick={handleClick}
      className="relative flex h-full min-h-10 w-10 shrink-0 items-center justify-center border-0 bg-transparent p-0 text-gold shadow-none transition-opacity hover:bg-transparent hover:opacity-80"
      aria-label={newCount > 0 ? `סופר אדמין, ${newCount} התראות חדשות` : 'סופר אדמין'}
      title={newCount > 0 ? `${newCount} התראות סופר אדמין חדשות` : 'סופר אדמין'}
    >
      <ShieldCheck className="h-[19px] w-[19px]" aria-hidden="true" />
      {newCount > 0 && (
        <span className="absolute -left-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
          {newCount > 99 ? '99+' : newCount}
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
    return Date.now() - 24 * 60 * 60 * 1000;
  }
  return parsed;
}
