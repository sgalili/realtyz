/**
 * cloudSession — reads the workspace's cloud Facebook connection state from
 * the session vault. This is the cloud-first source of truth: when a session
 * is active, group discovery, syncing and posting run on the cloud runner
 * with no local browser extension.
 */
import { supabase } from '@/integrations/supabase/client';

export type CloudSessionState = {
  /** True when a stored, unexpired, error-free Facebook session exists. */
  active: boolean;
  status: string | null;
  expiresAt: string | null;
  /** False when the cloud browser worker is not configured server-side. */
  workerReady: boolean;
  lastError: string | null;
};

const EMPTY: CloudSessionState = {
  active: false,
  status: null,
  expiresAt: null,
  workerReady: false,
  lastError: null,
};

/** Server-authorized (workspace-scoped) read of the cloud session state. */
export async function getCloudSessionState(): Promise<CloudSessionState> {
  try {
    const { data, error } = await supabase.functions.invoke('fb-session-vault', {
      body: { action: 'status' },
    });
    if (error || data?.error) return EMPTY;
    const s = data?.session;
    const expired = s?.expires_at ? new Date(s.expires_at).getTime() < Date.now() : false;
    return {
      active: s?.status === 'active' && !expired && !s?.last_error,
      status: s?.status ?? null,
      expiresAt: s?.expires_at ?? null,
      workerReady: data?.worker_ready === true,
      lastError: s?.last_error ?? null,
    };
  } catch {
    return EMPTY;
  }
}
