import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

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
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectorOpen, setSelectorOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setWorkspaces([]);
      setActiveWorkspaceId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [{ data, error }, { data: profile }] = await Promise.all([
        supabase.rpc('get_my_workspaces'),
        supabase.from('profiles').select('active_workspace_owner_id').eq('id', user.id).maybeSingle(),
      ]);
      if (error) throw error;
      const rows = (data ?? []) as Workspace[];
      setWorkspaces(rows);

      const stored = window.localStorage.getItem(STORAGE_KEY);
      const validStored = stored && rows.some((r) => r.workspace_owner_id === stored) ? stored : null;
      const profileActive = (profile as any)?.active_workspace_owner_id as string | null | undefined;
      const validProfile = profileActive && rows.some((r) => r.workspace_owner_id === profileActive) ? profileActive : null;
      const fallback = rows.find((r) => r.is_self)?.workspace_owner_id ?? rows[0]?.workspace_owner_id ?? user.id;
      const nextActive = validStored ?? validProfile ?? fallback;
      setActiveWorkspaceId(nextActive);
      if (nextActive) window.localStorage.setItem(STORAGE_KEY, nextActive);
    } catch (err) {
      // Fail open: fall back to self
      setWorkspaces([]);
      setActiveWorkspaceId(user.id);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setActiveWorkspace = useCallback(async (ownerId: string) => {
    setActiveWorkspaceId(ownerId);
    window.localStorage.setItem(STORAGE_KEY, ownerId);
    try {
      await supabase.rpc('set_active_workspace', { _owner: ownerId });
    } catch {
      // non-fatal
    }
  }, []);

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.workspace_owner_id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId],
  );

  const mustChoose = useMemo(() => {
    if (loading || !user) return false;
    if (workspaces.length <= 1) return false;
    return !window.localStorage.getItem(STORAGE_KEY);
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
