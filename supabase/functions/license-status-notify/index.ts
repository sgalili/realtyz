import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';
import { sendWhatsApp } from '../_shared/engagementJobs.ts';

// Broker-license status messages go only from Rita's official WhatsApp Business number,
// and only after Meta has approved the purpose-specific template.
const RITA = 'dc819834-1aa9-4aca-bb27-ec2c8cebde69';
const TEMPLATES = {
  pending: { name: 'license_review_pending', text: 'שלום {{1}}, קיבלנו את בקשת אימות רישיון התיווך שלך ב-TORAFF. הבקשה נמצאת כעת בבדיקת מנהל, ונעדכן אותך כאן ברגע שהבדיקה תסתיים.' },
  approved: { name: 'license_activated_published', text: 'שלום {{1}}, חשבונך ב-TORAFF אומת ופעיל בהצלחה! הנכסים שלך פורסמו לציבור. לצפייה במודעות שלך לחצו כאן: https://toraff.co.il/my-ads' },
  rejected: { name: 'license_review_rejected', text: 'שלום {{1}}, בדקנו את בקשת אימות רישיון התיווך שלך ב-TORAFF ולא ניתן היה לאשר אותה כרגע. אפשר לעדכן את מספר הרישיון או להעלות תעודה חדשה בעמוד הפרופיל ולשלוח שוב לבדיקה.' },
} as const;
type Kind = keyof typeof TEMPLATES;

const Body = z.union([
  z.object({ action: z.literal('submit_templates') }),
  z.object({ action: z.literal('notify'), user_id: z.string().uuid() }),
]);
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function metaCreds(admin: any) {
  const { data } = await admin.from('wa_providers').select('config').eq('provider_name', 'WBA').eq('is_active', true).eq('is_official', true).order('updated_at', { ascending: false }).limit(10);
  const cfg = (data ?? []).map((r: any) => r.config ?? {}).find((c: any) => c.waba_id && c.access_token) ?? {};
  const waba = String(cfg.waba_id ?? Deno.env.get('META_WABA_ID') ?? '').trim();
  const token = String(cfg.access_token ?? Deno.env.get('META_WA_ACCESS_TOKEN') ?? Deno.env.get('META_WHATSAPP_TOKEN') ?? '').trim();
  return { waba, token, v: String(cfg.api_version ?? 'v21.0') };
}

async function liveStatus(admin: any, name: string): Promise<string | null> {
  const { data: cached } = await admin.from('wa_message_templates').select('status').eq('owner_user_id', RITA).eq('name', name).eq('language', 'he').maybeSingle();
  if (cached?.status === 'APPROVED') return 'APPROVED';
  const { waba, token, v } = await metaCreds(admin);
  if (!waba || !token) return null;
  const r = await fetch(`https://graph.facebook.com/${v}/${waba}/message_templates?name=${name}&fields=name,language,status`, { headers: { Authorization: `Bearer ${token}` } });
  const d = await r.json().catch(() => ({}));
  const t = (d?.data ?? []).find((x: any) => x.name === name && x.language === 'he');
  if (!t) return null;
  const status = String(t.status).toUpperCase();
  const kind = (Object.keys(TEMPLATES) as Kind[]).find(k => TEMPLATES[k].name === name)!;
  await admin.from('wa_message_templates').upsert({ owner_user_id: RITA, name, language: 'he', category: 'UTILITY', status, body_text: TEMPLATES[kind].text, variable_count: 1, has_header_variable: false, synced_at: new Date().toISOString() }, { onConflict: 'owner_user_id,name,language' });
  return status;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u } = await admin.auth.getUser(jwt);
    const caller = u?.user?.id;
    if (!caller) return json({ error: 'Unauthorized' }, 401);
    const { data: isSa } = await admin.rpc('has_role', { _user_id: caller, _role: 'super_admin' });
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);

    if (parsed.data.action === 'submit_templates') {
      if (!isSa) return json({ error: 'Forbidden' }, 403);
      const { waba, token, v } = await metaCreds(admin);
      if (!waba || !token) return json({ error: 'missing Meta credentials' }, 500);
      const results: Record<string, unknown> = {};
      for (const t of Object.values(TEMPLATES)) {
        const r = await fetch(`https://graph.facebook.com/${v}/${waba}/message_templates`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: t.name, language: 'he', category: 'UTILITY', components: [{ type: 'BODY', text: t.text, example: { body_text: [['דנה']] } }] }),
        });
        results[t.name] = { status: r.status, body: await r.json().catch(() => null) };
        await liveStatus(admin, t.name);
      }
      return json({ ok: true, results });
    }

    const userId = parsed.data.user_id;
    const { data: reqRow } = await admin.from('broker_upgrade_requests').select('id,status,whatsapp_notified_status').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!reqRow) return json({ ok: true, sent: false, reason: 'no_request' });
    const kind: Kind | null = reqRow.status === 'pending' ? 'pending' : reqRow.status === 'approved' ? 'approved' : reqRow.status === 'rejected' ? 'rejected' : null;
    if (!kind) return json({ ok: true, sent: false });
    if (kind === 'pending' ? !(isSa || caller === userId) : !isSa) return json({ error: 'Forbidden' }, 403);
    if (reqRow.whatsapp_notified_status === kind) return json({ ok: true, sent: false, reason: 'already_sent' });
    if ((await liveStatus(admin, TEMPLATES[kind].name)) !== 'APPROVED') return json({ ok: true, sent: false, reason: 'template_not_approved' });
    const { data: p } = await admin.from('profiles').select('phone,full_name').eq('id', userId).maybeSingle();
    let phone = String(p?.phone ?? '').replace(/\D/g, '');
    if (phone.startsWith('0')) phone = `972${phone.slice(1)}`;
    if (!/^9725\d{8}$/.test(phone)) return json({ ok: true, sent: false, reason: 'no_phone' });
    const first = String(p?.full_name ?? '').trim().split(/\s+/)[0] || 'שלום';
    const res = await sendWhatsApp({ phone_number: phone, tenant_id: RITA, force_official: true, template_id: TEMPLATES[kind].name, template_language: 'he', template_components: [{ type: 'body', parameters: [{ type: 'text', text: first }] }] });
    let ok = false; try { ok = res.ok && JSON.parse(res.body).success === true; } catch { ok = false; }
    if (!ok) { console.error(`license notify failed [${res.status}]: ${res.body}`); return json({ ok: true, sent: false, reason: 'send_failed' }); }
    await admin.from('broker_upgrade_requests').update({ whatsapp_notified_status: kind }).eq('id', reqRow.id);
    return json({ ok: true, sent: true });
  } catch (e) {
    console.error('license-status-notify', e);
    return json({ error: 'internal' }, 500);
  }
});
