import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'https://esm.sh/zod@3.25.76';
import { adminClient, requireCaller, isSuperAdmin } from '../_shared/authz.ts';
import { BROKER_TEMPLATE_BODY, BROKER_TEMPLATE_LANGUAGE, templateBody, templateHasLink, invitationTemplateName, officialBrokerPhone } from '../_shared/brokerInvitationTemplate.ts';

const schema = z.object({
  action: z.enum(['status', 'register', 'send']),
  broker_id: z.string().uuid().optional(),
  text: z.string().max(1024).default(BROKER_TEMPLATE_BODY),
  request_id: z.string().uuid().optional(),
  consent: z.literal(true).optional(),
}).strict();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const caller = await requireCaller(req, ['user']);
  if (caller instanceof Response) return caller;
  if (caller.kind !== 'user' || !await isSuperAdmin(caller.userId)) return json({ error: 'Super Admin required' }, 403);
  let parsed;
  try { parsed = schema.safeParse(await req.json()); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const input = parsed.data;
  let body: string;
  try { body = templateBody(input.text); } catch (e) { return json({ error: e instanceof Error ? e.message : 'Invalid template' }, 400); }
  const name = await invitationTemplateName(body);
  const admin = adminClient();
  try {
    // Use only the platform's already configured official number, never the target broker's WABA.
    const { data: rows, error: configError } = await admin.from('wa_providers').select('config').eq('provider_name', 'WBA').eq('is_official', true).eq('is_active', true).order('updated_at', { ascending: false });
    if (configError) throw new Error('קריאת חיבור WhatsApp נכשלה');
    const cfg = rows?.map(r => r.config as Record<string, unknown>).find(c => String(c.display_phone_number ?? c.phone_number ?? '').replace(/\D/g, '') === '972537983832' && c.waba_id && c.phone_number_id && (c.access_token || Deno.env.get('META_WA_ACCESS_TOKEN')));
    if (!cfg) return json({ error: 'פרטי חשבון WhatsApp הרשמי אינם זמינים' }, 503);
    const token = String(cfg.access_token || Deno.env.get('META_WA_ACCESS_TOKEN') || '');
    const version = String(cfg.api_version || 'v25.0');
    if (!/^v\d+\.0$/.test(version) || !/^\d+$/.test(String(cfg.waba_id)) || !/^\d+$/.test(String(cfg.phone_number_id))) return json({ error: 'הגדרת WhatsApp הרשמי אינה תקינה' }, 503);
    const call = async (path: string, payload?: unknown) => {
      const res = await fetch(`https://graph.facebook.com/${version}/${path}`, { method: payload ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
      const raw = await res.text();
      if (!res.ok) { console.error(`Meta broker invitation [${res.status}]: ${raw}`); throw new Error(`[${res.status}]: ${raw}`); }
      const data = JSON.parse(raw);
      if (data.error) throw new Error(`[${res.status}]: ${raw}`);
      return data;
    };
    const live = await call(`${cfg.waba_id}/message_templates?name=${name}&fields=name,status,language,components&limit=100`);
    let template = live.data?.find((t: { name: string; language: string }) => t.name === name && t.language === BROKER_TEMPLATE_LANGUAGE);
    if (template && template.components?.find((c: { type: string }) => c.type === 'BODY')?.text !== body) return json({ error: 'נוסח Meta אינו תואם לתצוגה. יש לרענן לפני שליחה.' }, 409);
    if (input.action === 'register' && !template) {
      template = await call(`${cfg.waba_id}/message_templates`, { name, language: BROKER_TEMPLATE_LANGUAGE, category: 'MARKETING', components: [{ type: 'BODY', text: body, example: { body_text: [templateHasLink(body) ? ['ישראל ישראלי', 'https://toraff.co.il/auth?broker=00000000-0000-4000-8000-000000000001'] : ['ישראל ישראלי']] } }] });
    }
    if (input.action !== 'send') return json({ name, status: template?.status ?? 'NOT_REGISTERED', text: input.text, sender: '972537983832' });
    if (!input.broker_id || !input.request_id || !input.consent) return json({ error: 'נדרשים מתווך, מזהה שליחה ואישור הסכמת הנמען' }, 400);
    if (template?.status !== 'APPROVED') return json({ error: 'התבנית טרם אושרה ב-Meta', status: template?.status ?? 'NOT_REGISTERED' }, 409);
    const { data: broker, error: brokerError } = await admin.from('profiles').select('id,full_name,phone').eq('id', input.broker_id).single();
    const { data: brokerRoles, error: roleError } = await admin.from('user_roles').select('role').eq('user_id', input.broker_id).in('role', ['agent', 'lead_agent', 'managing_broker', 'junior_agent']);
    if (brokerError || roleError || !broker || !brokerRoles?.length) return json({ error: 'הנמען אינו מתווך פעיל' }, 400);
    const phone = officialBrokerPhone(broker.phone ?? '');
    if (!phone) return json({ error: 'חסר מספר נייד תקין למתווך' }, 400);
    const { data: onboarding, error: onboardingError } = await admin.from('admin_broker_onboarding').select('user_id').eq('user_id', broker.id).maybeSingle();
    if (onboardingError || !onboarding) return json({ error: 'המתווך אינו בתהליך הצטרפות בניהול מנהל' }, 409);
    const { error: claimError } = await admin.from('broker_invitation_sends').insert({ request_id: input.request_id, broker_id: broker.id, created_by: caller.userId, template_name: name });
    if (claimError) {
      const { data: prior } = await admin.from('broker_invitation_sends').select('status,message_id,broker_id,template_name,created_by').eq('request_id', input.request_id).maybeSingle();
      if (prior?.created_by === caller.userId && prior.broker_id === broker.id && prior.template_name === name && prior.status === 'accepted') return json({ success: true, message_id: prior.message_id, duplicate: true });
      return json({ error: 'שליחה זו כבר החלה. יש לבדוק את הסטטוס לפני ניסיון נוסף.' }, 409);
    }
    let sent;
    try {
      const site = new URL(Deno.env.get('PUBLIC_SITE_URL') || 'https://toraff.co.il');
      if (site.protocol !== 'https:' || /lovable\./.test(site.hostname)) throw new Error('Invalid public site');
      const link = `${site.origin}/auth?broker=${encodeURIComponent(broker.id)}`;
      sent = await call(`${cfg.phone_number_id}/messages`, { messaging_product: 'whatsapp', to: phone, type: 'template', template: { name, language: { code: BROKER_TEMPLATE_LANGUAGE }, components: [{ type: 'body', parameters: [{ type: 'text', text: broker.full_name?.trim() || 'מתווך' }, ...(templateHasLink(body) ? [{ type: 'text', text: link }] : [])] }] } });
    } catch (e) {
      await admin.from('broker_invitation_sends').update({ status: 'unknown' }).eq('request_id', input.request_id);
      throw e;
    }
    const messageId = sent.messages?.[0]?.id;
    if (!messageId) return json({ error: 'Meta לא החזירה מזהה הודעה; יש לבדוק לפני שליחה חוזרת' }, 502);
    const { error: sendError } = await admin.from('broker_invitation_sends').update({ status: 'accepted', message_id: messageId }).eq('request_id', input.request_id);
    const { error: trackError } = await admin.from('admin_broker_onboarding').update({ invited_at: new Date().toISOString(), invitation_message_id: messageId }).eq('user_id', broker.id);
    if (sendError || trackError) return json({ error: 'Meta קיבלה את ההודעה אך עדכון שלב ההצטרפות נכשל. אין לשלוח שוב.', message_id: messageId }, 500);
    return json({ success: true, message_id: messageId, status: 'accepted' });
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'שליחת ההזמנה נכשלה' }, 502); }
});