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
const WS_LIST_CACHE_KEY = 'realtyz-workspaces-cache';
const WS_LAST_ACTIVE_KEY = `${STORAGE_KEY}:last`;

const workspaceStorageKey = (userId: string) => `${STORAGE_KEY}:${userId}`;

/**
 * Workspaces (name + logo) are cached locally so the sidebar/header brand
 * paints on the FIRST frame after a refresh instead of flashing the default
 * Realtyz logo for ~2s while get_my_workspaces() round-trips.
 */
function readWorkspaceCache(): { list: Workspace[]; activeId: string | null } {
  try {
    const list = JSON.parse(localStorage.getItem(WS_LIST_CACHE_KEY) ?? '[]') as Workspace[];
    const activeId = localStorage.getItem(WS_LAST_ACTIVE_KEY);
    return { list: Array.isArray(list) ? list : [], activeId: activeId || null };
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
  const cachedInit = readWorkspaceCache();
  const [workspaces, setWorkspaces] = useState<Workspace[]>(cachedInit.list);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(cachedInit.activeId);
  const [loading, setLoading] = useState(cachedInit.list.length === 0);
  const [selectorOpen, setSelectorOpen] = useState(false);


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
      const rows = (data ?? []) as Workspace[];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);


  useEffect(() => {
    refresh();
  }, [refresh]);

  // Social-connection sentinel. Only warns when EVERY signal says there is no
  // usable connection (a bound Meta Page or a personal Facebook token).
  // Any read error is treated as "healthy" so RLS
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
      const [pageRes, socialRes, personalRes] = await Promise.all([
        supabase.from('messenger_page_bindings').select('id, page_id').limit(1),
        supabase.from('social_connections').select('id').limit(1),
        supabase.from('fb_personal_connections').select('id, access_token, token_expires_at').limit(1),
      ]);

      // Errors == unknown state, not broken state.
      if (pageRes.error || socialRes.error || personalRes.error) return;

      const hasKey = !!(pageRes.data ?? [])[0]?.page_id;
      const hasAccounts = (socialRes.data?.length ?? 0) > 0;
      const personal = (personalRes.data ?? [])[0] as any;
      const personalValid = !!personal?.access_token
        && (!personal.token_expires_at || new Date(personal.token_expires_at).getTime() > Date.now());

      if (hasKey || hasAccounts || personalValid) return; // healthy — stay silent

      relinkWarnedRef.current = true;
      window.sessionStorage.setItem('social_relink_dismissed', '1');
      toast.error('חיבור הרשתות החברתיות אינו תקין — יש לחדש חיבור בהגדרות', {
        duration: 8000,
        action: {
          label: 'חבר מחדש',
          onClick: () => { window.location.href = '/profile?tab=connections'; },
        },
      });
    })().catch(() => {});
  }, [user, loading]);

  const setActiveWorkspace = useCallback(async (ownerId: string) => {
    if (!user) return;
    setActiveWorkspaceId(ownerId);
    window.localStorage.setItem(workspaceStorageKey(user.id), ownerId);
    writeWorkspaceCache(workspaces, ownerId);

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
