// ============================================================
// Composer session persistence
// ------------------------------------------------------------
// A campaign composer session (which properties are being drafted, their
// scheduled slots and variants) must survive leaving the page, a hard
// refresh, a new tab, or even another device — until the drafts are
// published. We keep two layers:
//   1. localStorage — instant, synchronous restore on first paint.
//   2. campaign_composer_sessions — durable cloud mirror (per channel).
// ============================================================
import { supabase } from '@/integrations/supabase/client';

export type ComposerAssignment = {
  iso: string;
  listing: string | null;
  variant: number;
  totalVariants: number;
};

export type ComposerSession = {
  channel: string;
  propertyIds: string[];
  assignments: ComposerAssignment[];
  updatedAt: string;
};

const localKey = (channel: string) => `rz-composer-session:v1:${channel}`;
const slotKey = (channel: string) => `session:${channel}`;

const normalize = (raw: any, channel: string): ComposerSession | null => {
  if (!raw || typeof raw !== 'object') return null;
  const propertyIds = Array.isArray(raw.propertyIds)
    ? raw.propertyIds.filter((id: unknown) => typeof id === 'string' && id)
    : [];
  const assignments = Array.isArray(raw.assignments) ? raw.assignments : [];
  if (propertyIds.length === 0 && assignments.length === 0) return null;
  return {
    channel,
    propertyIds,
    assignments,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
};

/** Synchronous read for the very first render. */
export function readComposerSessionLocal(channel: string): ComposerSession | null {
  if (typeof window === 'undefined') return null;
  try {
    return normalize(JSON.parse(localStorage.getItem(localKey(channel)) || 'null'), channel);
  } catch {
    return null;
  }
}

/** Durable read — used when localStorage was cleared or on another device. */
export async function fetchComposerSession(channel: string): Promise<ComposerSession | null> {
  try {
    const { data } = await (supabase as any)
      .from('campaign_composer_sessions')
      .select('payload')
      .eq('channel', slotKey(channel))
      .maybeSingle();
    const session = normalize((data as any)?.payload, channel);
    if (session && typeof window !== 'undefined') {
      try { localStorage.setItem(localKey(channel), JSON.stringify(session)); } catch { /* quota */ }
    }
    return session;
  } catch {
    return null;
  }
}

/** Persist locally (instant) and to the cloud (durable). */
export async function saveComposerSession(
  channel: string,
  propertyIds: string[],
  assignments: ComposerAssignment[],
): Promise<void> {
  const session: ComposerSession = {
    channel,
    propertyIds,
    assignments,
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== 'undefined') {
    try { localStorage.setItem(localKey(channel), JSON.stringify(session)); } catch { /* quota */ }
  }
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await (supabase as any).from('campaign_composer_sessions').upsert(
      {
        user_id: user.id,
        workspace_owner_id: user.id,
        channel: slotKey(channel),
        payload: session as any,
        updated_at: session.updatedAt,
      },
      { onConflict: 'workspace_owner_id,channel' },
    );
  } catch {
    // The local copy still covers refreshes.
  }
}

/** Called only after the drafts are actually published / discarded. */
export async function clearComposerSession(channel: string): Promise<void> {
  if (typeof window !== 'undefined') {
    try { localStorage.removeItem(localKey(channel)); } catch { /* ignore */ }
  }
  try {
    await (supabase as any)
      .from('campaign_composer_sessions')
      .delete()
      .eq('channel', slotKey(channel));
  } catch { /* ignore */ }
}

// ---------- per-draft body/attachment mirror ----------

const draftSlot = (channel: string, instanceId: string) => `draft:${channel}:${instanceId}`;

export async function saveComposerDraftCloud(channel: string, instanceId: string, payload: unknown) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await (supabase as any).from('campaign_composer_sessions').upsert(
      {
        user_id: user.id,
        workspace_owner_id: user.id,
        channel: draftSlot(channel, instanceId),
        payload: payload as any,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_owner_id,channel' },
    );
  } catch { /* local copy still covers refreshes */ }
}

export async function fetchComposerDraftCloud(channel: string, instanceId: string): Promise<any | null> {
  try {
    const { data } = await (supabase as any)
      .from('campaign_composer_sessions')
      .select('payload')
      .eq('channel', draftSlot(channel, instanceId))
      .maybeSingle();
    return (data as any)?.payload ?? null;
  } catch {
    return null;
  }
}

export async function clearComposerDraftCloud(channel: string, instanceId: string) {
  try {
    await (supabase as any)
      .from('campaign_composer_sessions')
      .delete()
      .eq('channel', draftSlot(channel, instanceId));
  } catch { /* ignore */ }
}
