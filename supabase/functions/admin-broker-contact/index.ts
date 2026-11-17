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
    // Full import history across all time: every queued job item, legacy developer jobs and any imported entity not covered by a job.
    const all = async (make: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: unknown }>) => {
      const out: any[] = [];
      for (let from = 0; ; from += 1000) { const { data, error } = await make(from, from + 999); if (error) throw error; out.push(...(data ?? [])); if ((data?.length ?? 0) < 1000) break; }
      return out;
    };
    const chunked = async (ids: string[], make: (part: string[]) => PromiseLike<{ data: any[] | null; error: unknown }>) => {
      const out: any[] = []; for (let i = 0; i < ids.length; i += 200) { const { data, error } = await make(ids.slice(i, i + 200)); if (error) throw error; out.push(...(data ?? [])); } return out;
    };
    const [queueJobs, devJobs, onboard, allDevs, batchLogs] = await Promise.all([
      all((f, t) => admin.from('broker_import_jobs').select('id,status,error,checkpoint,created_at,updated_at').order('created_at', { ascending: false }).range(f, t)),
      all((f, t) => admin.from('developer_import_jobs').select('id,status,error,source_url,developer_id,company,completed_at,updated_at,created_at').order('created_at', { ascending: false }).range(f, t)),
      all((f, t) => admin.from('admin_broker_onboarding').select('user_id,created_at,import_source').eq('import_source', 'bright_data').order('created_at', { ascending: false }).range(f, t)),
      all((f, t) => admin.from('developers').select('id,company_name,logo_url,source_url,workspace_owner_id,created_at').not('source_url', 'is', null).range(f, t)),
      all((f, t) => admin.from('audit_logs').select('id,target_id,details,created_at').eq('action', 'super_admin.broker_batch_import').order('created_at', { ascending: false }).range(f, t)),
    ]);
    type Raw = { id: string; kind: 'developer' | 'broker'; ref: string | null; name: string | null; source_url: string | null; at: string; status: string; error: string | null };
    const raw: Raw[] = [];
    for (const j of queueJobs) {
      const c = (j.checkpoint ?? {}) as Record<string, any>;
      const devs = Array.isArray(c.developerResults) ? c.developerResults : [];
      devs.forEach((r: any, i: number) => raw.push({ id: `${j.id}:d${i}`, kind: 'developer', ref: r.developer_id ?? null, name: r.company_name ?? null, source_url: r.source_url ?? null, at: j.updated_at, status: r.status === 'failed' ? 'failed' : 'completed', error: r.error ?? null }));
      (Array.isArray(c.brokerResults) ? c.brokerResults : []).forEach((r: any, i: number) => raw.push({ id: `${j.id}:b${i}`, kind: 'broker', ref: r.broker_id ?? null, name: r.full_name ?? null, source_url: r.source_url ?? null, at: j.updated_at, status: 'completed', error: null }));
      const urls: string[] = Array.isArray(c.developerUrls) ? c.developerUrls : [];
      urls.slice(devs.length).forEach((u, i) => raw.push({ id: `${j.id}:p${i}`, kind: 'developer', ref: c.developerWork?.url === u ? c.developerWork?.developerId ?? null : null, name: c.developerWork?.url === u ? c.developerWork?.developer?.company_name ?? null : null, source_url: u, at: j.updated_at, status: j.status === 'completed' ? 'completed' : j.status, error: j.error ?? null }));
    }
    for (const j of devJobs) { const c = (j.company ?? {}) as Record<string, unknown>; raw.push({ id: j.id, kind: 'developer', ref: j.developer_id, name: String(c.name ?? c.company_name ?? '') || null, source_url: j.source_url, at: j.completed_at ?? j.updated_at ?? j.created_at, status: j.status, error: j.error ?? null }); }
    for (const a of batchLogs) if (a.target_id) { const d = (a.details ?? {}) as Record<string, any>; raw.push({ id: `batch:${a.id}`, kind: 'broker', ref: a.target_id, name: null, source_url: d.first_url ?? null, at: a.created_at, status: Number(d.imported ?? 0) > 0 || !d.total ? 'completed' : 'failed', error: Number(d.imported ?? 0) < Number(d.total ?? 0) ? `${d.total - d.imported} מודעות לא יובאו` : null }); }
    const seen = new Set(raw.filter(r => r.ref).map(r => r.ref));
    const seenUrls = new Set(raw.filter(r => r.kind === 'developer' && r.source_url).map(r => r.source_url));
    for (const d of allDevs) if (!seen.has(d.id) && !seenUrls.has(d.source_url)) raw.push({ id: `dev:${d.id}`, kind: 'developer', ref: d.id, name: d.company_name, source_url: d.source_url, at: d.created_at, status: 'completed', error: null });
    for (const o of onboard) if (!seen.has(o.user_id)) raw.push({ id: `onb:${o.user_id}`, kind: 'broker', ref: o.user_id, name: null, source_url: null, at: o.created_at, status: 'completed', error: null });
    const devIds = [...new Set(raw.filter(r => r.kind === 'developer' && r.ref).map(r => r.ref!))];
    const bIds = [...new Set(raw.filter(r => r.kind === 'broker' && r.ref).map(r => r.ref!))];
    const [devs, projects, profiles, offices, listings] = await Promise.all([
      chunked(devIds, p => admin.from('developers').select('id,company_name,logo_url').in('id', p)),
      chunked(devIds, p => admin.from('developer_projects').select('developer_id').in('developer_id', p).limit(10000)),
      chunked(bIds, p => admin.from('profiles').select('id,full_name,avatar_url').in('id', p)),
      chunked(bIds, p => admin.from('white_label_settings').select('user_id,agency_name,logo_url').in('user_id', p)),
      chunked(bIds, p => admin.from('listings').select('workspace_owner_id,source_url').in('workspace_owner_id', p).limit(10000)),
    ]);
    const items = raw.map(r => {
      if (r.kind === 'developer') { const d = devs.find(x => x.id === r.ref);
        return { id: r.id, kind: r.kind, status: r.status, error: r.error, name: d?.company_name ?? r.name ?? '', logo_url: d?.logo_url ?? null, agency_imported: !!d?.company_name, projects: r.ref ? projects.filter(p => p.developer_id === r.ref).length : 0, source_url: r.source_url, imported_at: r.at }; }
      const p = profiles.find(x => x.id === r.ref); const o = offices.find(x => x.user_id === r.ref); const l = listings.filter(x => x.workspace_owner_id === r.ref);
      return { id: r.id, kind: r.kind, status: r.status, error: r.error, name: p?.full_name ?? r.name ?? '', logo_url: o?.logo_url ?? p?.avatar_url ?? null, agency_imported: !!o?.agency_name, agency_name: o?.agency_name ?? null, projects: l.length, source_url: r.source_url ?? l.find(x => /yad2\.co\.il/.test(String(x.source_url)))?.source_url ?? null, imported_at: r.at };
    }).sort((a, b) => String(b.imported_at).localeCompare(String(a.imported_at)));
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
