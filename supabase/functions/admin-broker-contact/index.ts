// admin-broker-contact
// Super Admin-only queue of Bright Data imported brokers missing contact details.
// Saving a valid mobile completes the account so the existing invitation flows can be used. Never sends anything.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { adminClient, requireCaller, isSuperAdmin } from '../_shared/authz.ts';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }),
  z.object({ action: z.literal('save'), user_id: z.string().uuid(), phone: z.string().trim().max(20).optional(), email: z.string().trim().max(254).optional() }),
]);
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const normalizePhone = (v: string) => { const d = v.replace(/\D/g, ''); return /^05\d{8}$/.test(d) ? `972${d.slice(1)}` : /^9725\d{8}$/.test(d) ? d : null; };
const realEmail = (e?: string | null) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !e.endsWith('.invalid');

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const caller = await requireCaller(req, ['user']); if (caller instanceof Response) return caller;
  const admin = adminClient();
  if (caller.kind !== 'user' || !await isSuperAdmin(caller.userId, admin)) return json({ error: 'forbidden' }, 403);
  const parsed = schema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return json({ error: 'invalid_input' }, 400);
  const input = parsed.data;

  if (input.action === 'list') {
    const { data: rows, error } = await admin.from('admin_broker_onboarding').select('user_id,contact_status,first_login_at,email_consent_at,email_invited_at,invited_at,created_at').eq('import_source', 'bright_data').order('created_at', { ascending: false }).limit(300);
    if (error) return json({ error: 'קריאת הרשימה נכשלה' }, 500);
    const ids = (rows ?? []).map(r => r.user_id);
    if (!ids.length) return json({ brokers: [] });
    const [{ data: profiles }, { data: offices }, { data: licenses }, { data: drafts }, { data: verified }] = await Promise.all([
      admin.from('profiles').select('id,full_name,phone,email').in('id', ids),
      admin.from('white_label_settings').select('user_id,agency_name').in('user_id', ids),
      admin.from('admin_approved_broker_licenses').select('user_id,license_number').in('user_id', ids),
      admin.from('listings').select('workspace_owner_id').in('workspace_owner_id', ids).eq('is_published', false),
      admin.from('broker_license_verifications').select('user_id,license_number').in('user_id', ids),
    ]);
    const brokers = (rows ?? []).map(r => {
      const p = profiles?.find(x => x.id === r.user_id);
      return { user_id: r.user_id, full_name: p?.full_name ?? '', phone: p?.phone ?? null, email: realEmail(p?.email) ? p!.email : null,
        license_number: verified?.find(l => l.user_id === r.user_id)?.license_number ?? licenses?.find(l => l.user_id === r.user_id)?.license_number ?? null,
        office_name: offices?.find(o => o.user_id === r.user_id)?.agency_name ?? null,
        drafts: (drafts ?? []).filter(d => d.workspace_owner_id === r.user_id).length,
        contact_status: r.contact_status, first_login_at: r.first_login_at, email_consent_at: r.email_consent_at, email_invited_at: r.email_invited_at };
    }).filter(b => b.contact_status === 'pending_contact' || !b.phone || !b.email);
    return json({ brokers });
  }

  const { data: row } = await admin.from('admin_broker_onboarding').select('user_id,first_login_at').eq('user_id', input.user_id).eq('import_source', 'bright_data').maybeSingle();
  if (!row) return json({ error: 'המתווך לא יובא דרך Bright Data' }, 404);
  if (row.first_login_at) return json({ error: 'המתווך כבר התחבר; פרטי ההתקשרות שלו מנוהלים על ידו' }, 400);
  const phone = input.phone ? normalizePhone(input.phone) : null;
  if (input.phone && !phone) return json({ error: 'מספר נייד לא תקין (05X-XXXXXXX)' }, 400);
  const email = input.email ? input.email.toLowerCase() : null;
  if (email && !realEmail(email)) return json({ error: 'כתובת אימייל לא תקינה' }, 400);
  if (!phone && !email) return json({ error: 'יש להזין נייד או אימייל' }, 400);
  if (phone) {
    const { data: taken } = await admin.from('profiles').select('id').eq('phone', phone).neq('id', input.user_id).limit(1);
    if (taken?.length) return json({ error: 'מספר הנייד כבר משויך למשתמש אחר' }, 409);
  }
  if (email) {
    const { data: taken } = await admin.from('profiles').select('id').ilike('email', email).neq('id', input.user_id).limit(1);
    if (taken?.length) return json({ error: 'כתובת האימייל כבר משויכת למשתמש אחר' }, 409);
  }
  const { error: authError } = await admin.auth.admin.updateUserById(input.user_id, { ...(phone ? { phone: `+${phone}`, phone_confirm: true } : {}), ...(email ? { email, email_confirm: true } : {}) });
  if (authError) return json({ error: /already|exists/i.test(authError.message) ? 'הפרטים כבר משויכים לחשבון אחר' : 'עדכון החשבון נכשל' }, 400);
  const { data: profile, error: pe } = await admin.from('profiles').update({ ...(phone ? { phone } : {}), ...(email ? { email } : {}) }).eq('id', input.user_id).select('phone').single();
  if (pe) return json({ error: 'עדכון הפרופיל נכשל' }, 500);
  const complete = !!profile?.phone;
  await admin.from('admin_broker_onboarding').update(complete ? { contact_status: 'complete', contact_completed_at: new Date().toISOString(), contact_completed_by: caller.userId } : {}).eq('user_id', input.user_id);
  await admin.from('audit_logs').insert({ actor_id: caller.userId, action: 'super_admin.broker_contact_completed', target_table: 'profiles', target_id: input.user_id, details: { phone_set: !!phone, email_set: !!email, complete } });
  return json({ ok: true, complete });
});
