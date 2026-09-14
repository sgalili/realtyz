/**
 * useNotificationStates
 * ─────────────────────
 * Persists the read / deleted state of notification items in the database
 * (`notification_states`) so it survives refreshes, devices and sessions.
 *
 * A "notif_key" is the stable id of the underlying row (message id, tour id,
 * lead id, ...) so no extra bookkeeping table per source is needed.
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';

type StateRow = { notif_key: string; is_read: boolean; is_deleted: boolean };

export function useNotificationStates() {
  const { user } = useAuth();
  const workspaceOwnerId = useActiveWorkspaceOwnerId();
  const qc = useQueryClient();
  const queryKey = ['notification-states', user?.id];

  const { data } = useQuery({
    queryKey,
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('notification_states')
        .select('notif_key, is_read, is_deleted')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (rows ?? []) as StateRow[];
    },
  });

  const readKeys = new Set((data ?? []).filter((r) => r.is_read).map((r) => r.notif_key));
  const deletedKeys = new Set((data ?? []).filter((r) => r.is_deleted).map((r) => r.notif_key));

  const persist = useCallback(
    async (keys: string[], patch: { is_read?: boolean; is_deleted?: boolean }) => {
      const unique = [...new Set(keys.filter(Boolean))];
      if (!unique.length || !user?.id) return;
      // Optimistic local state so the drawer reacts instantly.
      qc.setQueryData<StateRow[]>(queryKey, (prev) => {
        const map = new Map((prev ?? []).map((r) => [r.notif_key, { ...r }]));
        unique.forEach((key) => {
          const existing = map.get(key) ?? { notif_key: key, is_read: false, is_deleted: false };
          map.set(key, { ...existing, ...patch });
        });
        return [...map.values()];
      });
      const rows = unique.map((key) => ({
        user_id: user.id,
        workspace_owner_id: workspaceOwnerId ?? null,
        notif_key: key,
        is_read: patch.is_read ?? true,
        is_deleted: patch.is_deleted ?? false,
      }));
      const { error } = await supabase
        .from('notification_states')
        .upsert(rows, { onConflict: 'user_id,notif_key' });
      if (error) qc.invalidateQueries({ queryKey });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id, workspaceOwnerId, qc],
  );

  const markRead = useCallback((keys: string[]) => void persist(keys, { is_read: true }), [persist]);
  const remove = useCallback(
    (keys: string[]) => void persist(keys, { is_read: true, is_deleted: true }),
    [persist],
  );

  return { readKeys, deletedKeys, markRead, remove };
}
