// rita-live: records sidebar Rita chats (visitors and signed-in users), alerts Super Admins about new chats
// and lets a Super Admin take over a chat, reply manually, and hand it back to Rita.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { adminClient, isSuperAdmin } from '../_shared/authz.ts';

const token = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('log'), visitor_token: token.optional(), role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(6000) }),
  z.object({ action: z.literal('poll'), visitor_token: token.optional(), after: z.string().datetime().optional() }),
  z.object({ action: z.literal('admin_reply'), session_id: z.string().uuid(), content: z.string().trim().min(1).max(4000) }),
  z.object({ action: z.literal('set_mode'), session_id: z.string().uuid(), mode: z.enum(['ai', 'human']) }),
]);
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const sha = async (v: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)))).map(b => b.toString(16).padStart(2, '0')).join('');
const SITE = 'https://toraff.co.il';

async function notifyAdmins(admin: any, sessionId: string, who: string, firstMessage: string) {
  const link = `/super-admin?section=rita-chats&session=${sessionId}`;
  const { data: supers } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin');
  const ids = [...new Set((supers ?? []).map((s: any) => s.user_id))] as string[];
  if (!ids.length) return;
  const preview = firstMessage.slice(0, 160);
  await admin.from('notifications').insert(ids.map(user_id => ({ user_id, event_type: 'rita_new_chat', title: `שיחה חדשה עם ריטה · ${who}`, body: preview, deep_link: link, channel: 'in_app' })));
  // Throttle WhatsApp alerts so anonymous visitors cannot flood the admin's phone.
  const { count } = await admin.from('rita_live_sessions').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) > 20) return;
  const { data: rows } = await admin.from('wa_providers').select('config').eq('provider_name', 'WBA').eq('is_official', true).eq('is_active', true).order('updated_at', { ascending: false });
  const cfg = rows?.map((r: any) => r.config as Record<string, unknown>).find((c: any) => c.phone_number_id && (c.access_token || Deno.env.get('META_WA_ACCESS_TOKEN')));
  if (!cfg) { console.warn('rita-live: no official WA config'); return; }
  const { data: profiles } = await admin.from('profiles').select('phone').in('id', ids);
  const text = `שיחה חדשה עם ריטה באתר TORAFF\nמאת: ${who}\nהודעה: ${preview}\nצפייה בשיחה בזמן אמת ומענה ידני:\n${SITE}${link}`;
  for (const p of profiles ?? []) {
    const to = String(p.phone ?? '').replace(/\D/g, '');
    if (!/^9725\d{8}$/.test(to)) continue;
    const res = await fetch(`https://graph.facebook.com/${String(cfg.api_version || 'v25.0')}/${cfg.phone_number_id}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${cfg.access_token || Deno.env.get('META_WA_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text, preview_url: true } }),
    }).catch(e => { console.error('rita-live wa failed', e); return null; });
    if (res?.ok) console.log('rita-live wa sent'); else if (res) console.error(`rita-live wa [${res.status}]: ${await res.text()}`);
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'invalid_input' }, 400);
  const input = parsed.data;
  const admin = adminClient();
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = bearer ? await admin.auth.getUser(bearer) : { data: null };
  const userId: string | null = auth?.user?.id ?? null;

  if (input.action === 'admin_reply' || input.action === 'set_mode') {
    if (!userId || !await isSuperAdmin(userId, admin)) return json({ error: 'forbidden' }, 403);
    if (input.action === 'set_mode') {
      const { error } = await admin.from('rita_live_sessions').update({ mode: input.mode, handled_by: input.mode === 'human' ? userId : null }).eq('id', input.session_id);
      return error ? json({ error: 'update_failed' }, 500) : json({ ok: true, mode: input.mode });
    }
    const now = new Date().toISOString();
    const { error } = await admin.from('rita_live_messages').insert({ session_id: input.session_id, role: 'admin', content: input.content, created_at: now });
    if (error) return json({ error: 'send_failed' }, 500);
    await admin.from('rita_live_sessions').update({ mode: 'human', handled_by: userId, last_message: input.content.slice(0, 300), last_role: 'admin', last_message_at: now }).eq('id', input.session_id);
    return json({ ok: true });
  }

  // Participant actions: a signed-in user owns one session; a visitor owns the session of their browser token.
  const hash = !userId && input.visitor_token ? await sha(input.visitor_token) : null;
  if (!userId && !hash) return json({ error: 'missing_identity' }, 400);
  const find = () => (userId ? admin.from('rita_live_sessions').select('id,mode,last_message_at').eq('user_id', userId) : admin.from('rita_live_sessions').select('id,mode,last_message_at').eq('visitor_token_hash', hash)).order('created_at', { ascending: false }).limit(1).maybeSingle();
  let { data: session } = await find();

  if (input.action === 'poll') {
    if (!session) return json({ mode: 'ai', messages: [] });
    let q = admin.from('rita_live_messages').select('id,content,created_at').eq('session_id', session.id).eq('role', 'admin').order('created_at').limit(50);
    if (input.after) q = q.gt('created_at', input.after);
    const { data } = await q;
    return json({ session_id: session.id, mode: session.mode, messages: data ?? [] });
  }

  let created = false;
  // A chat idle for six hours is treated as finished; the next user message starts (and announces) a new one.
  if (session && session.mode === 'ai' && Date.now() - Date.parse(session.last_message_at) > 6 * 3600_000) session = null;
  if (!session) {
    if (input.role !== 'user') return json({ ok: true, skipped: true });
    const { data, error } = await admin.from('rita_live_sessions').insert(userId ? { user_id: userId } : { visitor_token_hash: hash }).select('id,mode,last_message_at').single();
    if (error) { ({ data: session } = await find()); if (!session) return json({ error: 'create_failed' }, 500); }
    else { session = data; created = true; }
  }
  if (input.role === 'assistant' && session!.mode === 'human') return json({ ok: true, mode: 'human' });
  const now = new Date().toISOString();
  await admin.from('rita_live_messages').insert({ session_id: session!.id, role: input.role, content: input.content, created_at: now });
  await admin.from('rita_live_sessions').update({ last_message: input.content.slice(0, 300), last_role: input.role, last_message_at: now }).eq('id', session!.id);
  if (created) {
    let who = 'מבקר אנונימי';
    if (userId) { const { data: p } = await admin.from('profiles').select('full_name').eq('id', userId).maybeSingle(); who = p?.full_name?.trim() || 'משתמש רשום'; }
    if (!(userId && await isSuperAdmin(userId, admin))) { const job = notifyAdmins(admin, session!.id, who, input.content).catch(e => console.error('rita-live notify failed', e)); (globalThis as any).EdgeRuntime?.waitUntil?.(job) ?? await job; }
  }
  return json({ ok: true, session_id: session!.id, mode: session!.mode });
});
