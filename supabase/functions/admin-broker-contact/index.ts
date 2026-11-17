// admin-broker-contact
// Super Admin-only queue of Bright Data imported brokers missing contact details.
// Saving a valid mobile completes the account so the existing invitation flows can be used. Never sends anything.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { adminClient, requireCaller, isSuperAdmin } from '../_shared/authz.ts';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }),
  z.object({ action: z.literal('history') }),
  z.object({ action: z.literal('imports') }),
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

  if (input.action === 'history') {
    // Every invitation sent from the hub: official WhatsApp sends plus recorded email invitations.
    const [{ data: wa }, { data: em }] = await Promise.all([
      admin.from('broker_invitation_sends').select('broker_id,status,created_at').order('created_at', { ascending: false }).limit(300),
      admin.from('admin_broker_onboarding').select('user_id,email_invited_at,email_message_id').not('email_invited_at', 'is', null).order('email_invited_at', { ascending: false }).limit(300),
    ]);
    const items = [
      ...(wa ?? []).map(r => ({ user_id: r.broker_id, channel: 'whatsapp', status: r.status, sent_at: r.created_at })),
      ...(em ?? []).map(r => ({ user_id: r.user_id, channel: 'email', status: r.email_message_id ? 'sent' : 'pending', sent_at: r.email_invited_at })),
    ].sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at))).slice(0, 300);
    const ids = [...new Set(items.map(i => i.user_id))];
    if (!ids.length) return json({ items: [] });
    const [{ data: profiles }, { data: offices }] = await Promise.all([
      admin.from('profiles').select('id,full_name,avatar_url').in('id', ids),
      admin.from('white_label_settings').select('user_id,agency_name,logo_url').in('user_id', ids),
    ]);
    return json({ items: items.map(i => { const p = profiles?.find(x => x.id === i.user_id); const o = offices?.find(x => x.user_id === i.user_id);
      return { ...i, full_name: p?.full_name ?? '', avatar_url: (p as any)?.avatar_url ?? null, office_name: o?.agency_name ?? null, office_logo_url: o?.logo_url ?? null }; }) });
  }

  if (input.action === 'imports') {
    // Completed Yad2 developer imports plus Bright Data broker imports, newest first.
    const [{ data: jobs }, { data: brokers }] = await Promise.all([
      admin.from('developer_import_jobs').select('id,source_url,developer_id,company,completed_at,updated_at').eq('status', 'completed').order('updated_at', { ascending: false }).limit(200),
      admin.from('admin_broker_onboarding').select('user_id,created_at').eq('import_source', 'bright_data').order('created_at', { ascending: false }).limit(200),
    ]);
    const devIds = [...new Set((jobs ?? []).map(j => j.developer_id).filter(Boolean))] as string[];
    const bIds = (brokers ?? []).map(b => b.user_id);
    const [{ data: devs }, { data: projects }, { data: profiles }, { data: offices }, { data: listings }] = await Promise.all([
      devIds.length ? admin.from('developers').select('id,company_name,logo_url,phone').in('id', devIds) : Promise.resolve({ data: [] as any[] }),
      devIds.length ? admin.from('developer_projects').select('developer_id').in('developer_id', devIds) : Promise.resolve({ data: [] as any[] }),
      bIds.length ? admin.from('profiles').select('id,full_name,avatar_url').in('id', bIds) : Promise.resolve({ data: [] as any[] }),
      bIds.length ? admin.from('white_label_settings').select('user_id,agency_name,logo_url').in('user_id', bIds) : Promise.resolve({ data: [] as any[] }),
      bIds.length ? admin.from('listings').select('workspace_owner_id,source_url').in('workspace_owner_id', bIds).not('source_url', 'is', null).limit(2000) : Promise.resolve({ data: [] as any[] }),
    ]);
    const items = [
      ...(jobs ?? []).map(j => { const d = devs?.find(x => x.id === j.developer_id); const c = (j.company ?? {}) as Record<string, unknown>;
        return { id: j.id, kind: 'developer', name: d?.company_name ?? String(c.name ?? c.company_name ?? 'יזם'), logo_url: d?.logo_url ?? null, agency_imported: !!(d?.company_name), projects: (projects ?? []).filter(p => p.developer_id === j.developer_id).length, source_url: j.source_url, imported_at: j.completed_at ?? j.updated_at }; }),
      ...(brokers ?? []).map(b => { const p = profiles?.find(x => x.id === b.user_id); const o = offices?.find(x => x.user_id === b.user_id); const l = (listings ?? []).filter(x => x.workspace_owner_id === b.user_id);
        return { id: b.user_id, kind: 'broker', name: p?.full_name ?? '', logo_url: o?.logo_url ?? (p as any)?.avatar_url ?? null, agency_imported: !!o?.agency_name, agency_name: o?.agency_name ?? null, projects: l.length, source_url: l.find(x => /yad2\.co\.il/.test(String(x.source_url)))?.source_url ?? null, imported_at: b.created_at }; }),
    ].sort((a, b) => String(b.imported_at).localeCompare(String(a.imported_at)));
    return json({ items });
  }

  if (input.action === 'list') {
    const { data: rows, error } = await admin.from('admin_broker_onboarding').select('user_id,contact_status,first_login_at,email_consent_at,email_invited_at,invited_at,created_at').eq('import_source', 'bright_data').order('created_at', { ascending: false }).limit(300);
    if (error) return json({ error: 'קריאת הרשימה נכשלה' }, 500);
    const ids = (rows ?? []).map(r => r.user_id);
    if (!ids.length) return json({ brokers: [] });
    const [{ data: profiles }, { data: offices }, { data: licenses }, { data: drafts }, { data: verified }, { data: devRoles }] = await Promise.all([
      admin.from('profiles').select('id,full_name,phone,email,avatar_url,city,broker_license_number,locked_broker_name').in('id', ids),
      admin.from('white_label_settings').select('user_id,agency_name,logo_url').in('user_id', ids),
      admin.from('admin_approved_broker_licenses').select('user_id,license_number').in('user_id', ids),
      admin.from('listings').select('workspace_owner_id').in('workspace_owner_id', ids).eq('is_published', false),
      admin.from('broker_license_verifications').select('user_id,license_number,verified_at').in('user_id', ids),
      admin.from('user_roles').select('user_id').in('user_id', ids).eq('role', 'developer'),
    ]);
    const brokers = (rows ?? []).map(r => {
      const p = profiles?.find(x => x.id === r.user_id);
      return { user_id: r.user_id, full_name: p?.full_name ?? '', phone: p?.phone ?? null, email: realEmail(p?.email) ? p!.email : null,
        license_number: verified?.find(l => l.user_id === r.user_id)?.license_number ?? licenses?.find(l => l.user_id === r.user_id)?.license_number ?? null,
        office_name: offices?.find(o => o.user_id === r.user_id)?.agency_name ?? null,
        office_logo_url: offices?.find(o => o.user_id === r.user_id)?.logo_url ?? null, avatar_url: (p as any)?.avatar_url ?? null,
        profile_license: (p as any)?.broker_license_number ?? null, city: (p as any)?.city ?? null,
        license_verified: !!verified?.find(l => l.user_id === r.user_id && l.verified_at) || !!(p as any)?.locked_broker_name,
        is_developer: (devRoles ?? []).some(d => d.user_id === r.user_id),
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
