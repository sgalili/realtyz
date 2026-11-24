// admin-broker-contact
// Super Admin-only queue of silently imported accounts awaiting a first invitation.
// Saving a valid mobile completes the account so the existing invitation flows can be used. Never sends anything.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { adminClient, requireCaller, isSuperAdmin } from '../_shared/authz.ts';
import { invitationLink, pendingFirstInvitation, publicSiteOrigin } from '../_shared/importInvitationPolicy.ts';
import { readAllRows } from '../_shared/readAllRows.ts';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }),
  z.object({ action: z.literal('history') }),
  z.object({ action: z.literal('followups') }),
  z.object({ action: z.literal('imports') }),
  z.object({ action: z.literal('delete_import'), record_id: z.string().min(1).max(120).regex(/^(?:(?:batch|dev|onb):)?[0-9a-f-]{36}(?::[dbp]\d+)?$/i) }),
  z.object({ action: z.literal('save'), user_id: z.string().uuid(), phone: z.string().trim().max(20).optional(), email: z.string().trim().max(254).optional(), gender: z.enum(['male','female']).optional(), office_name: z.string().trim().min(2).max(120).optional() }),
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

  if (input.action === 'followups') {
    const { data: rows, error } = await admin.from('import_invitation_followups').select('user_id,channel,due_at,status,message').eq('status', 'pending').order('due_at');
    if (error) return json({ error: 'קריאת התזכורות נכשלה' }, 500);
    const items = [];
    for (const row of rows ?? []) {
      const [{ data: onboarding }, { data: auth }, { data: profile }] = await Promise.all([
        admin.from('admin_broker_onboarding').select('first_login_at,invitation_clicked_at,email_consent_at,email_unsubscribed_at,invitation_link_token').eq('user_id', row.user_id).maybeSingle(),
        admin.auth.admin.getUserById(row.user_id),
        admin.from('profiles').select('full_name').eq('id', row.user_id).maybeSingle(),
      ]);
      if (!onboarding || onboarding.first_login_at || onboarding.invitation_clicked_at || auth?.user?.last_sign_in_at || (row.channel === 'email' && (!onboarding.email_consent_at || onboarding.email_unsubscribed_at))) {
        await admin.from('import_invitation_followups').update({ status: 'cancelled' }).eq('user_id', row.user_id);
      } else items.push({ ...row, message: `${row.message}\n${invitationLink(publicSiteOrigin(), row.user_id, onboarding.invitation_link_token)}`, full_name: profile?.full_name ?? '' });
    }
    return json({ items });
  }

  if (input.action === 'delete_import') {
    // The history aggregates operational records; never delete the queue, inventory or account behind a log row.
    const { error } = await admin.from('import_history_deleted_records').upsert({ record_key: input.record_id, deleted_by: caller.userId }, { onConflict: 'record_key', ignoreDuplicates: true });
    if (error) return json({ error: 'מחיקת הרשומה נכשלה' }, 500);
    return json({ ok: true });
  }

  if (input.action === 'history') {
    // Every invitation sent from the hub: official WhatsApp sends plus recorded email invitations.
    const historyReads = await Promise.all([
      admin.from('broker_invitation_sends').select('broker_id,status,created_at,template_name').order('created_at', { ascending: false }).limit(300),
      admin.from('admin_broker_onboarding').select('user_id,email_invited_at,email_message_id').not('email_invited_at', 'is', null).order('email_invited_at', { ascending: false }).limit(300),
      admin.from('broker_invitation_emails').select('broker_id,to_email,subject,body_text,links,is_demo,status,error,created_at,message_id').order('created_at', { ascending: false }).limit(300),
    ]);
    if(historyReads.some(result=>result.error))return json({error:'לא ניתן לקרוא את היסטוריית השליחות כרגע'},503);
    const [{data:wa},{data:em},{data:logs}]=historyReads;
    const logged = new Set((logs ?? []).map(l => l.message_id).filter(Boolean));
    const items = [
      ...(wa ?? []).map(r => ({ user_id: r.broker_id, channel: 'whatsapp', status: r.status, sent_at: r.created_at, content: { template: r.template_name } })),
      ...(logs ?? []).map(l => ({ user_id: l.broker_id, channel: 'email', status: l.status, sent_at: l.created_at, content: { to: l.to_email, subject: l.subject, body: l.body_text, links: l.links, demo: l.is_demo, error: l.error } })),
      ...(em ?? []).filter(r => !r.email_message_id || !logged.has(r.email_message_id)).map(r => ({ user_id: r.user_id, channel: 'email', status: r.email_message_id ? 'sent' : 'pending', sent_at: r.email_invited_at })),
    ].sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at))).slice(0, 300);
    const ids = [...new Set(items.map(i => i.user_id))];
    if (!ids.length) return json({ items: [] });
    const identityReads = await Promise.all([
      admin.from('profiles').select('id,full_name,avatar_url,phone').in('id', ids),
      admin.from('white_label_settings').select('user_id,agency_name,logo_url').in('user_id', ids),
      admin.from('user_roles').select('user_id,role').in('user_id', ids).in('role', ['developer', 'marketing_company']),
    ]);
    if(identityReads.some(result=>result.error))return json({error:'לא ניתן לקרוא את פרטי השליחות כרגע'},503);
    const [{data:profiles},{data:offices},{data:roles}]=identityReads;
    const { data: histDevs,error:logoError } = await admin.from('developers').select('workspace_owner_id,logo_url').in('workspace_owner_id', ids);
    if(logoError)return json({error:'לא ניתן לקרוא את פרטי השליחות כרגע'},503);
    const kindOf = (id: string) => (roles ?? []).some(r => r.user_id === id && r.role === 'marketing_company') ? 'marketing_company' : (roles ?? []).some(r => r.user_id === id && r.role === 'developer') ? 'developer' : 'broker';
    return json({ items: items.map(i => { const p = profiles?.find(x => x.id === i.user_id); const o = offices?.find(x => x.user_id === i.user_id);
      return { ...i, recipient_kind: kindOf(i.user_id), full_name: p?.full_name ?? '', avatar_url: (p as any)?.avatar_url ?? null, phone: (p as any)?.phone ?? null, developer_logo_url: histDevs?.find(d => d.workspace_owner_id === i.user_id)?.logo_url ?? o?.logo_url ?? null, office_name: o?.agency_name ?? null, office_logo_url: o?.logo_url ?? null }; }) });
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
    const [queueJobs, devJobs, onboard, allDevs, batchLogs, deletedRecords] = await Promise.all([
      all((f, t) => admin.from('broker_import_jobs').select('id,status,error,checkpoint,created_at,updated_at').order('created_at', { ascending: false }).range(f, t)),
      all((f, t) => admin.from('developer_import_jobs').select('id,status,error,source_url,developer_id,company,completed_at,updated_at,created_at').order('created_at', { ascending: false }).range(f, t)),
      all((f, t) => admin.from('admin_broker_onboarding').select('user_id,created_at,import_source').eq('import_source', 'bright_data').order('created_at', { ascending: false }).range(f, t)),
      all((f, t) => admin.from('developers').select('id,company_name,logo_url,source_url,workspace_owner_id,created_at').not('source_url', 'is', null).range(f, t)),
      all((f, t) => admin.from('audit_logs').select('id,target_id,details,created_at').eq('action', 'super_admin.broker_batch_import').order('created_at', { ascending: false }).range(f, t)),
      all((f, t) => admin.from('import_history_deleted_records').select('record_key').order('record_key').range(f, t)),
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
    const devIds = [...new Set(raw.flatMap(r => r.kind === 'developer' && r.ref ? [r.ref] : []))];
    const bIds = [...new Set(raw.flatMap(r => r.kind === 'broker' && r.ref ? [r.ref] : []))];
    const [devs, projects, profiles, offices, listings] = await Promise.all([
      chunked(devIds, p => admin.from('developers').select('id,company_name,logo_url,workspace_owner_id,owner_user_id').in('id', p)),
      Promise.all(devIds.map(async developer_id => {
        const { count, error } = await admin.from('developer_projects').select('id', { count: 'exact', head: true }).eq('developer_id', developer_id);
        if (error || count === null) throw error ?? new Error('inventory_count_unavailable');
        return { developer_id, count };
      })),
      chunked(bIds, p => admin.from('profiles').select('id,full_name,avatar_url').in('id', p)),
      chunked(bIds, p => admin.from('white_label_settings').select('user_id,agency_name,logo_url').in('user_id', p)),
      chunked(bIds, p => readAllRows((from, to) => admin.from('listings').select('workspace_owner_id,source_url').in('workspace_owner_id', p).order('id').range(from, to)).then(data => ({ data, error: null }))),
    ]);
    const developerOwners = [...new Set(devs.flatMap(d => d.workspace_owner_id ? [d.workspace_owner_id] : []))];
    const devProfiles = await chunked(developerOwners, p => admin.from('profiles').select('id,full_name,avatar_url').in('id', p));
    const deleted = new Set(deletedRecords.map(r => r.record_key));
    const items = raw.filter(r => !deleted.has(r.id)).map(r => {
      if (r.kind === 'developer') { const d = devs.find(x => x.id === r.ref);
        const p = devProfiles.find(p => p.id === d?.workspace_owner_id);
        return { id: r.id, kind: r.kind, status: r.status, error: r.error, name: p?.full_name || d?.company_name || r.name || '', workspace_owner_id: d?.workspace_owner_id ?? null, public_user_id: d?.owner_user_id ?? d?.workspace_owner_id ?? null, avatar_url: p?.avatar_url ?? null, agency_name: d?.company_name ?? r.name ?? null, logo_url: d?.logo_url ?? null, agency_imported: !!d?.company_name, projects: projects.find(p => p.developer_id === r.ref)?.count ?? 0, source_url: r.source_url, imported_at: r.at }; }
      const p = profiles.find(x => x.id === r.ref); const o = offices.find(x => x.user_id === r.ref); const l = listings.filter(x => x.workspace_owner_id === r.ref);
      return { id: r.id, kind: r.kind, status: r.status, error: r.error, name: p?.full_name ?? r.name ?? '', workspace_owner_id: p?.id ?? null, public_user_id: p?.id ?? null, avatar_url: p?.avatar_url ?? null, logo_url: o?.logo_url ?? null, agency_imported: !!o?.agency_name, agency_name: o?.agency_name ?? null, projects: l.length, source_url: r.source_url ?? l.find(x => /yad2\.co\.il/.test(String(x.source_url)))?.source_url ?? null, imported_at: r.at };
    }).sort((a, b) => String(b.imported_at).localeCompare(String(a.imported_at)));
    // Hide nameless rows (deleted/never-created entities) and keep one latest row per imported account.
    const shown = new Set<string>();
    const withAccount = new Set(items.filter(i => i.workspace_owner_id).map(i => `${i.kind}:${String(i.name).trim()}`));
    const unique = items.filter(i => {
      if (!String(i.name ?? '').trim()) return false;
      if (!i.workspace_owner_id && withAccount.has(`${i.kind}:${String(i.name).trim()}`)) return false;
      const key = i.workspace_owner_id ? `${i.kind}:${i.workspace_owner_id}` : `id:${i.id}`;
      if (shown.has(key)) return false;
      shown.add(key); return true;
    });
    return json({ items: unique });
  }

  if (input.action === 'list') {
    const rows = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await admin.from('admin_broker_onboarding').select('user_id,contact_status,import_source,imported_license_number,first_invitation_at,first_login_at,email_consent_at,email_invited_at,invited_at,created_at').not('import_source', 'is', null).is('first_invitation_at', null).is('first_login_at', null).order('user_id').range(start, start + 499);
      if (error) return json({ error: 'קריאת הרשימה נכשלה' }, 500);
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < 500) break;
    }
    const eligible = [];
    for (const row of rows) {
      const { data, error } = await admin.auth.admin.getUserById(row.user_id);
      if (error) return json({ error: 'בדיקת החשבונות נכשלה' }, 500);
      if (data.user && pendingFirstInvitation(row, data.user.last_sign_in_at ?? null)) eligible.push(row);
    }
    const ids = eligible.map(r => r.user_id);
    if (!ids.length) return json({ brokers: [] });
    const brokerReads = await Promise.all([
      admin.from('profiles').select('id,full_name,phone,email,avatar_url,city,broker_license_number,locked_broker_name,gender').in('id', ids),
      admin.from('white_label_settings').select('user_id,agency_name,logo_url').in('user_id', ids),
      admin.from('admin_approved_broker_licenses').select('user_id,license_number').in('user_id', ids),
      admin.rpc('imported_account_inventory_counts', { owner_ids: ids }),
      admin.from('broker_license_verifications').select('user_id,license_number,verified_at').in('user_id', ids),
      admin.from('user_roles').select('user_id').in('user_id', ids).eq('role', 'developer'),
    ]);
    if(brokerReads.some(result=>result.error))return json({error:'לא ניתן לקרוא את פרטי המתווכים כרגע'},503);
    const [{data:profiles},{data:offices},{data:licenses},{data:inventory,error:inventoryError},{data:verified},{data:devRoles}]=brokerReads;
    if (inventoryError || !inventory || inventory.length !== ids.length) return json({ error: 'קריאת ספירת הפרויקטים והדירות נכשלה; יש לרענן ולנסות שוב' }, 500);
    const { data: devCompanies,error:companyError } = await admin.from('developers').select('workspace_owner_id,company_name,logo_url').in('workspace_owner_id', ids);
    if(companyError)return json({error:'לא ניתן לקרוא את פרטי המתווכים כרגע'},503);
    const { data: whatsappContacts, error: whatsappError } = await admin.from('broker_whatsapp_contacts').select('broker_id,whatsapp_phone,whatsapp_link').in('broker_id', ids);
    if (whatsappError) return json({ error: 'קריאת פרטי WhatsApp נכשלה' }, 500);
    const brokers = eligible.map(r => {
      const p = profiles?.find(x => x.id === r.user_id);
      const counts = inventory.find((x: { user_id: string }) => x.user_id === r.user_id);
      return { user_id: r.user_id, created_at: r.created_at, full_name: p?.full_name ?? '', phone: p?.phone ?? null, email: realEmail(p?.email) ? p?.email : null,
        whatsapp_phone: whatsappContacts?.find(c => c.broker_id === r.user_id)?.whatsapp_phone ?? null,
        whatsapp_link: whatsappContacts?.find(c => c.broker_id === r.user_id)?.whatsapp_link ?? null,
        license_number: verified?.find(l => l.user_id === r.user_id)?.license_number ?? licenses?.find(l => l.user_id === r.user_id)?.license_number ?? r.imported_license_number ?? null,
        office_name: offices?.find(o => o.user_id === r.user_id)?.agency_name ?? devCompanies?.find(d => d.workspace_owner_id === r.user_id)?.company_name ?? null,
        office_logo_url: offices?.find(o => o.user_id === r.user_id)?.logo_url ?? devCompanies?.find(d => d.workspace_owner_id === r.user_id)?.logo_url ?? null, avatar_url: (p as any)?.avatar_url ?? null,
        profile_license: (p as any)?.broker_license_number ?? null, gender: (p as any)?.gender ?? null, city: (p as any)?.city ?? null,
        license_verified: !!verified?.find(l => l.user_id === r.user_id && l.verified_at) || !!(p as any)?.locked_broker_name,
        is_developer: (devRoles ?? []).some(d => d.user_id === r.user_id),
        drafts: Number(counts?.drafts ?? 0),
        projects: Number(counts?.projects ?? 0),
        apartments: Number(counts?.apartments ?? 0),
        contact_status: r.contact_status, first_login_at: r.first_login_at, email_consent_at: r.email_consent_at, email_invited_at: r.email_invited_at };
    });
    return json({ brokers });
  }

  const { data: row } = await admin.from('admin_broker_onboarding').select('user_id,first_login_at').eq('user_id', input.user_id).not('import_source', 'is', null).maybeSingle();
  if (!row) return json({ error: 'החשבון לא הוקם ביבוא' }, 404);
  if (row.first_login_at) return json({ error: 'המתווך כבר התחבר; פרטי ההתקשרות שלו מנוהלים על ידו' }, 400);
  if (input.office_name && !input.phone && !input.email && !input.gender) {
    const { data: updated, error: oe } = await admin.from('white_label_settings').update({ agency_name: input.office_name }).eq('user_id', input.user_id).select('user_id');
    const { error: ie } = !oe && !updated?.length ? await admin.from('white_label_settings').insert({ user_id: input.user_id, agency_name: input.office_name }) : { error: null };
    if (oe || ie) return json({ error: 'שמירת שם המשרד נכשלה' }, 500);
    await admin.from('audit_logs').insert({ actor_id: caller.userId, action: 'super_admin.broker_office_set', target_table: 'white_label_settings', target_id: input.user_id, details: { agency_name: input.office_name } });
    return json({ ok: true, complete: false });
  }
  if (input.gender && !input.phone && !input.email) {
    const { error: ge } = await admin.from('profiles').update({ gender: input.gender }).eq('id', input.user_id);
    if (ge) return json({ error: 'שמירת המגדר נכשלה' }, 500);
    await admin.from('audit_logs').insert({ actor_id: caller.userId, action: 'super_admin.broker_gender_set', target_table: 'profiles', target_id: input.user_id, details: { gender: input.gender } });
    return json({ ok: true, complete: false, gender: input.gender });
  }
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
