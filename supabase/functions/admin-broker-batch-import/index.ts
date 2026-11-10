import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'https://esm.sh/zod@3.25.76';
import { adminClient, requireCaller, isSuperAdmin } from '../_shared/authz.ts';
import { normalizeBatchBroker, BATCH_NO_EMAIL_DOMAIN } from '../_shared/brokerBatchImport.ts';

// One broker per call (client walks the batch) so each import fits the function time limit.
const schema = z.object({ broker: z.object({
  full_name: z.string().trim().min(2).max(200),
  phone: z.string().min(8).max(20),
  email: z.string().email().optional().nullable(),
  license_number: z.string().regex(/^[1-9][0-9]{3,9}$/),
  office_name: z.string().trim().max(200).optional().nullable(),
  listing_urls: z.array(z.string().url()).min(1).max(10),
}) }).strict();
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const caller = await requireCaller(req, ['user']);
  if (caller instanceof Response) return caller;
  if (caller.kind !== 'user' || !await isSuperAdmin(caller.userId)) return json({ error: 'Super Admin required' }, 403);
  let parsed; try { parsed = schema.safeParse(await req.json()); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const b = normalizeBatchBroker(parsed.data.broker);
  if (!b.phone) return json({ error: 'מספר נייד לא תקין' }, 400);
  if (!b.urls.length) return json({ error: 'אין קישורי מודעות תקינים' }, 400);
  const admin = adminClient();
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!; const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Reuse an existing admin-onboarded broker with the same phone; never touch a self-registered account.
  let brokerId: string | null = null; let created = false;
  const { data: existing } = await admin.from('profiles').select('id').eq('phone', b.phone).limit(2);
  if (existing?.length) {
    const { data: ob } = await admin.from('admin_broker_onboarding').select('user_id').eq('user_id', existing[0].id).maybeSingle();
    if (existing.length > 1 || !ob) return json({ status: 'skipped', reason: 'מספר הנייד שייך לחשבון קיים שלא נוצר בהצטרפות מנהל' });
    brokerId = existing[0].id;
  } else {
    const pw = crypto.randomUUID() + crypto.randomUUID();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/super-admin-create-user`, { method: 'POST', headers: { Authorization: req.headers.get('Authorization')!, apikey: Deno.env.get('SUPABASE_ANON_KEY')!, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: b.email ?? `${b.phone}@${BATCH_NO_EMAIL_DOMAIN}`, password: pw, full_name: b.full_name, phone_e164: b.phone, broker_license_number: b.license_number, approve_broker: true }) });
    const out = await res.json().catch(() => ({}));
    const id = out?.user_id ?? out?.user?.id ?? out?.id;
    if (!res.ok || out?.ok === false || !id) return json({ status: 'failed', reason: typeof out?.error === 'string' ? out.error : 'יצירת המתווך נכשלה' });
    brokerId = id; created = true;
  }
  if (b.office_name) {
    const { data: wl } = await admin.from('white_label_settings').select('id,agency_name').eq('user_id', brokerId).maybeSingle();
    if (!wl) await admin.from('white_label_settings').insert({ user_id: brokerId, agency_name: b.office_name, brokerage_name: b.office_name, brokerage_license: b.license_number });
    else if (!wl.agency_name) await admin.from('white_label_settings').update({ agency_name: b.office_name, brokerage_name: b.office_name }).eq('id', wl.id);
  }
  // Each ad enters the broker's own workspace as an unpublished draft via the existing importer.
  const listings: { url: string; ok: boolean; error?: string }[] = [];
  for (const url of b.urls) {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/yad2-unlocker`, { method: 'POST', headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ owner_id: brokerId, url, import_item: true, limit: 1, pages: 1 }), signal: AbortSignal.timeout(45000) });
      const d = await r.json().catch(() => ({}));
      const ok = r.ok && d?.success !== false && (d?.listing_id || d?.records_saved > 0);
      listings.push({ url, ok: !!ok, ...(ok ? {} : { error: String(d?.detail ?? d?.error ?? r.status) }) });
    } catch (e) { listings.push({ url, ok: false, error: e instanceof Error ? e.message : 'timeout' }); }
  }
  await admin.from('audit_logs').insert({ actor_id: caller.userId, action: 'super_admin.broker_batch_import', target_table: 'profiles', target_id: brokerId, details: { created, imported: listings.filter(l => l.ok).length, total: listings.length } });
  return json({ status: 'ok', broker_id: brokerId, created, imported: listings.filter(l => l.ok).length, listings });
});
