import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { writeAppMode } from '@/hooks/useAppMode';

export type Workspace = {
  workspace_owner_id: string;
  user_id: string;
  role: string;
  workspace_name: string;
  workspace_logo_url: string | null;
  account_type: string | null;
  last_accessed_at: string | null;
  owner_full_name: string | null;
  owner_email: string | null;
  owner_avatar_url: string | null;
  is_self: boolean;
};

type WorkspaceContextType = {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  activeWorkspace: Workspace | null;
  setActiveWorkspace: (ownerId: string) => Promise<void>;
  refresh: () => Promise<void>;
  loading: boolean;
  mustChoose: boolean;
  selectorOpen: boolean;
  openSelector: () => void;
  closeSelector: () => void;
};

const STORAGE_KEY = 'realtyz-active-workspace';
const WS_LIST_CACHE_KEY = 'realtyz-workspaces-cache';
const WS_LAST_ACTIVE_KEY = `${STORAGE_KEY}:last`;

const workspaceStorageKey = (userId: string) => `${STORAGE_KEY}:${userId}`;

function dedupeWorkspaces(rows: Workspace[], currentUserId?: string): Workspace[] {
  const byOwner = new Map<string, Workspace>();

  for (const workspace of rows) {
    const previous = byOwner.get(workspace.workspace_owner_id);
    if (!previous) {
      byOwner.set(workspace.workspace_owner_id, workspace);
      continue;
    }

    const workspaceIsCurrentUser = workspace.user_id === currentUserId;
    const previousIsCurrentUser = previous.user_id === currentUserId;
    const workspaceAccessedAt = workspace.last_accessed_at ? Date.parse(workspace.last_accessed_at) : 0;
    const previousAccessedAt = previous.last_accessed_at ? Date.parse(previous.last_accessed_at) : 0;

    if (
      (workspaceIsCurrentUser && !previousIsCurrentUser)
      || (workspaceIsCurrentUser === previousIsCurrentUser && workspaceAccessedAt > previousAccessedAt)
    ) {
      byOwner.set(workspace.workspace_owner_id, workspace);
    }
  }

  return Array.from(byOwner.values());
}

/**
 * Workspaces (name + logo) are cached locally so the sidebar/header brand
 * paints on the FIRST frame after a refresh instead of flashing the default
 * Realtyz logo for ~2s while get_my_workspaces() round-trips.
 */
function readWorkspaceCache(): { list: Workspace[]; activeId: string | null } {
  try {
    const list = JSON.parse(localStorage.getItem(WS_LIST_CACHE_KEY) ?? '[]') as Workspace[];
    const activeId = localStorage.getItem(WS_LAST_ACTIVE_KEY);
    return { list: Array.isArray(list) ? dedupeWorkspaces(list) : [], activeId: activeId || null };
  } catch {
    return { list: [], activeId: null };
  }
}

function writeWorkspaceCache(list: Workspace[], activeId: string | null) {
  try {
    localStorage.setItem(WS_LIST_CACHE_KEY, JSON.stringify(list));
    if (activeId) localStorage.setItem(WS_LAST_ACTIVE_KEY, activeId);
  } catch { /* storage unavailable */ }
}


const WorkspaceContext = createContext<WorkspaceContextType>({
  workspaces: [],
  activeWorkspaceId: null,
  activeWorkspace: null,
  setActiveWorkspace: async () => {},
  refresh: async () => {},
  loading: true,
  mustChoose: false,
  selectorOpen: false,
  openSelector: () => {},
  closeSelector: () => {},
});

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const cachedInit = readWorkspaceCache();
  const [workspaces, setWorkspaces] = useState<Workspace[]>(cachedInit.list);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(cachedInit.activeId);
  const [loading, setLoading] = useState(cachedInit.list.length === 0);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const initializedUserRef = useRef<string | null>(null);


  const refresh = useCallback(async () => {
    if (!user) {
      setWorkspaces([]);
      setActiveWorkspaceId(null);
      setLoading(false);
      return;
    }
    setLoading(workspaces.length === 0);
    try {
      const [{ data, error }, { data: profile }] = await Promise.all([
        supabase.rpc('get_my_workspaces'),
        supabase.from('profiles').select('active_workspace_owner_id').eq('id', user.id).maybeSingle(),
      ]);
      if (error) throw error;
      const rows = dedupeWorkspaces((data ?? []) as Workspace[], user.id);
      setWorkspaces(rows);

      const stored = window.localStorage.getItem(workspaceStorageKey(user.id));
      const validStored = stored && rows.some((r) => r.workspace_owner_id === stored) ? stored : null;
      const profileActive = (profile as any)?.active_workspace_owner_id as string | null | undefined;
      const fallback = rows.find((r) => r.is_self)?.workspace_owner_id ?? rows[0]?.workspace_owner_id ?? user.id;
      // A browser choice is explicit and account-scoped. Without one, always
      // start in the user's own empty workspace; never inherit a workspace
      // selection left on the profile by an admin/super-admin session.
      const nextActive = validStored ?? fallback;
      setActiveWorkspaceId(nextActive);
      if (nextActive) {
        window.localStorage.setItem(workspaceStorageKey(user.id), nextActive);
      }
      writeWorkspaceCache(rows, nextActive);
      if (profileActive !== nextActive) {
        void supabase.rpc('set_active_workspace', { _owner: nextActive });
      }
    } catch (err) {
      // Fail open: keep whatever we already have on screen (cached list) and
      // fall back to self so the UI never blanks out.
      setActiveWorkspaceId((prev) => prev ?? user.id);
    } finally {
      setLoading(false);
    }
    // Keyed by the user id only: a refreshed session object must never retrigger
    // the whole workspace fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);


  useEffect(() => {
    const userId = user?.id ?? null;
    if (!userId) {
      initializedUserRef.current = null;
      void refresh();
      return;
    }
    // Auth token refreshes and parent renders must not repeat the profile and
    // workspace initialization queries for the same signed-in account.
    if (initializedUserRef.current === userId) return;
    initializedUserRef.current = userId;
    void refresh();
  }, [user?.id, refresh]);

  // The "reconnect your social networks" toast was removed by request — it
  // fired on public/affiliate screens where the connection check isn't useful.

  const setActiveWorkspace = useCallback(async (ownerId: string) => {
    if (!user) return;
    // Change the server-side workspace first. Refetching before this completes
    // can briefly return rows from the previous tenant under the new UI label.
    const { error } = await supabase.rpc('set_active_workspace', { _owner: ownerId });
    if (error) {
      toast.error('לא ניתן לעבור למרחב העבודה שנבחר');
      throw error;
    }

    setActiveWorkspaceId(ownerId);
    window.localStorage.setItem(workspaceStorageKey(user.id), ownerId);
    writeWorkspaceCache(workspaces, ownerId);

    // A workspace hand-off always lands in broker mode, so the מתווך/שותף
    // toggle and the routes it guards never keep the previous tenant's state.
    writeAppMode('broker');

    // Remove old tenant results before any observer can repaint, then refetch
    // active screens and sidebar counters against the newly committed scope.
    try {
      queryClient.removeQueries();
      // Mounted observers are re-created after removal; invalidation schedules
      // their reads while preserving a fully empty cache during the handoff.
      await queryClient.invalidateQueries({ refetchType: 'active' });
    } catch { /* non-fatal */ }

    // Every screen listening for a tenant change repaints from scratch.
    window.dispatchEvent(new CustomEvent('realtyz:workspace-changed', { detail: { ownerId } }));
  }, [user, workspaces, queryClient]);


  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.workspace_owner_id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId],
  );

  const mustChoose = useMemo(() => {
    if (loading || !user) return false;
    if (workspaces.length <= 1) return false;
    return !window.localStorage.getItem(workspaceStorageKey(user.id));
  }, [workspaces, loading, user]);

  // Auto-open selector when login leaves the user with no active workspace and multiple options.
  useEffect(() => {
    if (mustChoose) setSelectorOpen(true);
  }, [mustChoose]);

  const value: WorkspaceContextType = {
    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    setActiveWorkspace,
    refresh,
    loading,
    mustChoose,
    selectorOpen,
    openSelector: () => setSelectorOpen(true),
    closeSelector: () => setSelectorOpen(false),
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export const useWorkspace = () => useContext(WorkspaceContext);

/** Returns the active workspace owner id (or current user's id as fallback). */
export function useActiveWorkspaceOwnerId(): string | null {
  const { activeWorkspaceId } = useWorkspace();
  const { user } = useAuth();
  return activeWorkspaceId ?? user?.id ?? null;
}
