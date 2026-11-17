import { supabase } from '@/integrations/supabase/client';

// Records sidebar Rita chats so Super Admins can follow them and take over.
const TOKEN_KEY = 'toraff-rita-live-token';
export function visitorToken(): string {
  try {
    let t = localStorage.getItem(TOKEN_KEY);
    if (!t || !/^[A-Za-z0-9_-]{32,128}$/.test(t)) {
      t = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(TOKEN_KEY, t);
    }
    return t;
  } catch { return 'ephemeral' + Math.random().toString(36).slice(2).padEnd(40, '0'); }
}

export type LiveMode = 'ai' | 'human';
export type AdminLiveMessage = { id: string; content: string; created_at: string };
export const ADMIN_REPLY_PREFIX = 'צוות TORAFF';

export async function ritaLiveLog(role: 'user' | 'assistant', content: string, guest: boolean): Promise<LiveMode> {
  if (!content.trim()) return 'ai';
  const { data } = await supabase.functions.invoke('rita-live', { body: { action: 'log', role, content: content.slice(0, 6000), ...(guest ? { visitor_token: visitorToken() } : {}) } }).catch(() => ({ data: null }));
  return data?.mode === 'human' ? 'human' : 'ai';
}

export async function ritaLivePoll(after: string | undefined, guest: boolean): Promise<{ mode: LiveMode; messages: AdminLiveMessage[]; session_id?: string } | null> {
  const { data, error } = await supabase.functions.invoke('rita-live', { body: { action: 'poll', ...(after ? { after } : {}), ...(guest ? { visitor_token: visitorToken() } : {}) } });
  if (error || !data) return null;
  return { mode: data.mode === 'human' ? 'human' : 'ai', messages: data.messages ?? [], session_id: data.session_id };
}
