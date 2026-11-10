import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'https://esm.sh/zod@3.25.76';
import { adminClient, requireCaller, isSuperAdmin } from '../_shared/authz.ts';
import { brokerFirstName, brokerInvitationEmailHtml, propertyExample, BROKER_EMAIL_BATCH_MAX } from '../_shared/brokerInvitationEmail.ts';

// Email only to brokers whose consent a Super Admin recorded; never to scraped contacts without consent.
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('summary') }),
  z.object({ action: z.literal('consent'), broker_id: z.string().uuid(), note: z.string().trim().min(3).max(300), revoke: z.boolean().optional() }),
  z.object({ action: z.literal('send_batch'), limit: z.number().int().min(1).max(BROKER_EMAIL_BATCH_MAX).default(BROKER_EMAIL_BATCH_MAX) }),
]);
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const page = (msg: string) => new Response(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><body style="font-family:Arial;text-align:center;padding:60px">${msg}</body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const admin = adminClient();
  const url = new URL(req.url);
  const unsub = url.searchParams.get('unsubscribe');
  if (unsub) {
    if (!/^[0-9a-f-]{36}$/i.test(unsub)) return page('קישור לא תקין');
    const { error } = await admin.from('admin_broker_onboarding').update({ email_unsubscribed_at: new Date().toISOString() }).eq('email_unsubscribe_token', unsub).is('email_unsubscribed_at', null);
    return page(error ? 'ההסרה נכשלה, נסו שוב' : 'הוסרת מרשימת התפוצה של TORAFF. לא יישלחו אליך הודעות נוספות.');
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const caller = await requireCaller(req, ['user']);
  if (caller instanceof Response) return caller;
  if (caller.kind !== 'user' || !await isSuperAdmin(caller.userId)) return json({ error: 'Super Admin required' }, 403);
  let parsed; try { parsed = schema.safeParse(await req.json()); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const input = parsed.data;

  if (input.action === 'consent') {
    const patch = input.revoke ? { email_consent_at: null, email_consent_by: null, email_consent_note: null } : { email_consent_at: new Date().toISOString(), email_consent_by: caller.userId, email_consent_note: input.note };
    const { data, error } = await admin.from('admin_broker_onboarding').update(patch).eq('user_id', input.broker_id).select('user_id').maybeSingle();
    if (error || !data) return json({ error: 'המתווך אינו בתהליך הצטרפות' }, 404);
    return json({ success: true });
  }

  const { data: rows, error } = await admin.from('admin_broker_onboarding').select('user_id,email_unsubscribe_token').not('email_consent_at', 'is', null).is('email_unsubscribed_at', null).is('email_invited_at', null).is('first_login_at', null).limit(500);
  if (error) return json({ error: 'קריאת רשימת המתווכים נכשלה' }, 500);
  const ids = (rows ?? []).map(r => r.user_id);
  const { data: profiles } = ids.length ? await admin.from('profiles').select('id,full_name,email').in('id', ids) : { data: [] };
  const eligible = (rows ?? []).map(r => ({ ...r, p: profiles?.find(p => p.id === r.user_id) })).filter(r => r.p?.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.p.email) && !r.p.email.endsWith('.invalid'));
  if (input.action === 'summary') return json({ eligible: eligible.length, batch_max: BROKER_EMAIL_BATCH_MAX });

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY'); const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!LOVABLE_API_KEY || !RESEND_API_KEY) return json({ error: 'חיבור Resend אינו מוגדר' }, 503);
  const site = new URL(Deno.env.get('PUBLIC_SITE_URL') || 'https://toraff.co.il');
  const fnBase = `${Deno.env.get('SUPABASE_URL')}/functions/v1/admin-broker-email-invitation`;
  const results: { broker_id: string; status: string; error?: string }[] = [];
  for (const r of eligible.slice(0, input.limit)) {
    // Claim first so a retry or parallel click never sends twice.
    const now = new Date().toISOString();
    const { data: claimed } = await admin.from('admin_broker_onboarding').update({ email_invited_at: now }).eq('user_id', r.user_id).is('email_invited_at', null).select('user_id').maybeSingle();
    if (!claimed) { results.push({ broker_id: r.user_id, status: 'skipped' }); continue; }
    const { data: listings } = await admin.from('listings').select('property_title,address,city,deal_type').eq('workspace_owner_id', r.user_id).not('status', 'in', '(removed,sold,discarded)').order('created_at', { ascending: false }).limit(10);
    const examples = (listings ?? []).map(propertyExample).filter((v): v is string => !!v).slice(0, 2);
    const unsubscribeUrl = `${fnBase}?unsubscribe=${r.email_unsubscribe_token}`;
    const link = `${site.origin}/auth?broker=${encodeURIComponent(r.user_id)}`;
    const firstName = brokerFirstName(r.p!.full_name);
    try {
      const res = await fetch('https://connector-gateway.lovable.dev/resend/emails', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LOVABLE_API_KEY}`, 'X-Connection-Api-Key': RESEND_API_KEY }, body: JSON.stringify({
        from: 'TORAFF <invite@realtyz.co.il>', to: [r.p!.email], subject: firstName ? `${firstName}, הנכסים שלך כבר מחכים לך ב-TORAFF` : 'הנכסים שלך כבר מחכים לך ב-TORAFF',
        html: brokerInvitationEmailHtml({ firstName, examples, link, unsubscribeUrl }),
        headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        tags: [{ name: 'type', value: 'broker_invitation' }],
      }) });
      const raw = await res.text();
      if (!res.ok) throw new Error(`[${res.status}]: ${raw}`);
      await admin.from('admin_broker_onboarding').update({ email_message_id: JSON.parse(raw).id ?? null }).eq('user_id', r.user_id);
      results.push({ broker_id: r.user_id, status: 'sent' });
    } catch (e) {
      console.error('broker invitation email failed', e);
      await admin.from('admin_broker_onboarding').update({ email_invited_at: null }).eq('user_id', r.user_id);
      results.push({ broker_id: r.user_id, status: 'failed', error: e instanceof Error ? e.message : 'failed' });
    }
  }
  return json({ sent: results.filter(r => r.status === 'sent').length, failed: results.filter(r => r.status === 'failed').length, remaining: Math.max(0, eligible.length - results.filter(r => r.status === 'sent').length), results });
});
