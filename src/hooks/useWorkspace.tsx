import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { toast } from 'sonner';
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

const workspaceStorageKey = (userId: string) => `${STORAGE_KEY}:${userId}`;

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

      const stored = window.localStorage.getItem(workspaceStorageKey(user.id));
      const validStored = stored && rows.some((r) => r.workspace_owner_id === stored) ? stored : null;
      const profileActive = (profile as any)?.active_workspace_owner_id as string | null | undefined;
      const validProfile = profileActive && rows.some((r) => r.workspace_owner_id === profileActive) ? profileActive : null;
      const fallback = rows.find((r) => r.is_self)?.workspace_owner_id ?? rows[0]?.workspace_owner_id ?? user.id;
      // Server/profile selection wins over stale browser storage so tenants
      // always land in the workspace they were authenticated/assigned into.
      const nextActive = validProfile ?? validStored ?? fallback;
      setActiveWorkspaceId(nextActive);
      if (nextActive && (validStored || validProfile || rows.length <= 1)) {
        window.localStorage.setItem(workspaceStorageKey(user.id), nextActive);
      }
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

  // Social-connection sentinel. Only warns when EVERY signal says there is no
  // usable connection (Ayrshare profile key, linked social accounts, or a
  // personal Facebook token). Any read error is treated as "healthy" so RLS
  // hiccups never produce a false-positive banner. Dismissed for the session
  // once shown.
  const relinkWarnedRef = useRef(false);
  useEffect(() => {
    if (!user || loading) return;
    if (relinkWarnedRef.current) return;
    if (window.sessionStorage.getItem('social_relink_dismissed') === '1') {
      relinkWarnedRef.current = true;
      return;
    }
    (async () => {
      const [profileRes, accountsRes, personalRes] = await Promise.all([
        supabase.from('workspace_social_profile').select('ayrshare_profile_key').maybeSingle(),
        supabase.from('ayrshare_social_accounts').select('id').limit(1),
        supabase.from('fb_personal_connections').select('id, access_token, expires_at').limit(1),
      ]);

      // Errors == unknown state, not broken state.
      if (profileRes.error || accountsRes.error || personalRes.error) return;

      const hasKey = !!(profileRes.data as any)?.ayrshare_profile_key?.toString().trim();
      const hasAccounts = (accountsRes.data?.length ?? 0) > 0;
      const personal = (personalRes.data ?? [])[0] as any;
      const personalValid = !!personal?.access_token
        && (!personal.expires_at || new Date(personal.expires_at).getTime() > Date.now());

      if (hasKey || hasAccounts || personalValid) return; // healthy — stay silent

      relinkWarnedRef.current = true;
      window.sessionStorage.setItem('social_relink_dismissed', '1');
      toast.error('חיבור הרשתות החברתיות אינו תקין — יש לחדש חיבור בהגדרות', {
        duration: 8000,
        action: {
          label: 'חבר מחדש',
          onClick: () => { window.location.href = '/api-settings#facebook'; },
        },
      });
    })().catch(() => {});
  }, [user, loading]);

  const setActiveWorkspace = useCallback(async (ownerId: string) => {
    if (!user) return;
    setActiveWorkspaceId(ownerId);
    window.localStorage.setItem(workspaceStorageKey(user.id), ownerId);
    try {
      await supabase.rpc('set_active_workspace', { _owner: ownerId });
    } catch {
      // non-fatal
    }
  }, [user]);

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
