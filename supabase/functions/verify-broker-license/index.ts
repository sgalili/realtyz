import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { BROKER_LICENSE_PATTERN, BROKER_REGISTRY_DATASET, BROKER_REGISTRY_RESOURCE, BROKER_REGISTRY_SOURCE, INVALID_BROKER_LICENSE, BROKER_REGISTRY_UNAVAILABLE, exactRegistryRecord, registrySourceIsFresh, registryDisplayName } from '../_shared/brokerRegistry.ts';

const schema = z.object({ licenseNumber: z.string().regex(BROKER_LICENSE_PATTERN), action: z.enum(['check', 'verify']).default('check') }).strict();
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function officialJson(url: URL) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: 'error' });
  if (!response.ok) throw new Error('registry_unavailable');
  const result = await response.json();
  if (result?.success !== true || !result.result) throw new Error('registry_unavailable');
  return result.result;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return reply({ valid: false, error: 'invalid_license', message: INVALID_BROKER_LICENSE }, 400);
  const { action } = parsed.data;
  const licenseNumber = parsed.data.licenseNumber.trim().replace(/^0+/, '');
  let userId: string | undefined;
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (action === 'verify') {
    if (!url || !anon) return reply({ valid: false, message: BROKER_REGISTRY_UNAVAILABLE }, 503);
    const authorization = req.headers.get('Authorization') ?? '';
    const authClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data, error } = await authClient.auth.getUser();
    if (error || !data.user) return reply({ valid: false, error: 'auth_required', message: 'יש להתחבר כדי לאמת רישיון' }, 401);
    userId = data.user.id;
  } else if (url && anon && req.headers.get('Authorization')) {
    const { data } = await createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }).auth.getUser();
    userId = data.user?.id;
  }
  let stage = 'registry_lookup';
  let profileResult: unknown;
  let active = false;
  try {
    // Server-only test licenses are bound to one account.
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (url && serviceKey) {
      const { data: testLicense } = await createClient(url, serviceKey).from('test_broker_licenses').select('user_id').eq('license_number', licenseNumber).maybeSingle();
      if (testLicense) return reply({ valid: false, error: 'official_license_required', message: INVALID_BROKER_LICENSE });
    }
    const metadataUrl = new URL('https://data.gov.il/api/3/action/package_show');
    metadataUrl.searchParams.set('id', BROKER_REGISTRY_DATASET);
    const searchUrl = new URL('https://data.gov.il/api/3/action/datastore_search');
    searchUrl.searchParams.set('resource_id', BROKER_REGISTRY_RESOURCE);
    searchUrl.searchParams.set('filters', JSON.stringify({ 'מס רשיון': Number(licenseNumber) }));
    searchUrl.searchParams.set('limit', '2');
    const [metadata, results] = await Promise.all([officialJson(metadataUrl), officialJson(searchUrl)]);
    const resource = metadata.resources?.find((r: { id?: string }) => r.id === BROKER_REGISTRY_RESOURCE);
    const updatedAt = resource?.last_modified;
    if (metadata.organization?.name !== 'ministry_of_justice' || !updatedAt || !registrySourceIsFresh(updatedAt) || !Array.isArray(results.records)) throw new Error('registry_unavailable');
    let records: unknown[] = results.records;
    if (!exactRegistryRecord(records, licenseNumber)) {
      const fallback = new URL(searchUrl); fallback.searchParams.delete('filters'); fallback.searchParams.set('q', licenseNumber); fallback.searchParams.set('limit', '20');
      records = (await officialJson(fallback)).records ?? [];
    }
    const record = exactRegistryRecord(records, licenseNumber);
    if (!record) return reply({ valid: false, error: 'license_not_found', message: INVALID_BROKER_LICENSE });
    const rawName = String(record['שם המתווך']).trim();
    const city = String(record['עיר מגורים'] ?? '').trim();
    let displayName = registryDisplayName(rawName);
    if (action === 'verify') {
      stage = 'account_verification';
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!key || !url || !userId) throw new Error('registry_unavailable');
      const admin = createClient(url, key);
      const { data: sms } = await admin.from('broker_sms_verifications').select('phone_number').eq('user_id', userId).maybeSingle();
      const { data: authAccount } = await admin.auth.admin.getUserById(userId);
      if (!sms || !authAccount.user?.phone_confirmed_at || sms.phone_number !== String(authAccount.user.phone ?? '').replace(/\D/g, '')) return reply({ valid: false, error: 'sms_required', message: 'יש להשלים אימות SMS לפני אימות הרישיון' }, 403);
      const { data: profile } = await admin.from('profiles').select('full_name').eq('id', userId).maybeSingle();
      const { data: previous } = await admin.from('broker_license_verifications').select('account_name_before_verification').eq('user_id', userId).maybeSingle();
      const accountName = previous?.account_name_before_verification ?? profile?.full_name ?? '';
      displayName = registryDisplayName(rawName, accountName);
      stage = 'registry_save';
      const { error: registryError } = await admin.from('official_brokers_registry').upsert({ license_number: licenseNumber, holder_name: rawName, display_name: displayName, registry_city: city, source_url: BROKER_REGISTRY_SOURCE, source_updated_at: updatedAt, checked_at: new Date().toISOString() });
      if (registryError) throw new Error('registry_not_saved');
      stage = 'evidence_save';
      const { error } = await admin.from('broker_license_verifications').upsert({ user_id: userId, license_number: licenseNumber, registry_holder_name: rawName, account_name_before_verification: accountName, source_url: BROKER_REGISTRY_SOURCE, source_updated_at: updatedAt, verified_at: new Date().toISOString() });
      if (error) throw new Error('verification_not_saved');
      stage = 'license_link';
      const { error: completeError } = await admin.rpc('complete_official_license_verification', { _uid: userId, _number: licenseNumber });
      if (completeError) throw new Error('verification_not_completed');
      stage = 'identity_save';
      const { data: saved, error: cityError } = await admin.from('profiles').update({ full_name: displayName, locked_broker_name: displayName, city: city || null, locked_broker_city: city }).eq('id', userId).eq('broker_license_number', licenseNumber).select('id,full_name,city,broker_license_number,locked_broker_name,locked_broker_city,phone,gender').single();
      if (cityError) throw new Error('registry_city_not_saved');
      profileResult = saved;
      // Activation remains server-owned: existing approved brokers stay active;
      // new accounts auto-approve only with matching certificate and pre-registry identity.
      const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', userId);
      active = (roles ?? []).some(row => ['agent', 'lead_agent', 'managing_broker'].includes(row.role));
      if (!active) {
        const caller = createClient(url, anon ?? '', { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
        const { data: approval, error: approvalError } = await caller.rpc('submit_broker_upgrade_request');
        active = !approvalError && approval?.status === 'approved';
      }
      if (active) await admin.from('affiliate_profiles').update({ license_number: licenseNumber, license_holder_name: displayName, license_status: 'verified', license_verified_at: new Date().toISOString(), license_rejection_reason: null }).eq('user_id', userId);
    }
    // Holder name (public registry data) is returned only to signed-in callers, for the signup confirmation step.
    return reply({ valid: true, source: BROKER_REGISTRY_SOURCE, updatedAt, ...(userId ? { holderName: displayName, city } : {}), ...(action === 'verify' ? { profile: profileResult, active } : {}) });
  } catch {
    console.warn('[verify-broker-license]', { stage, code: 'verification_failed' });
    return reply({ valid: false, error: 'registry_unavailable', message: BROKER_REGISTRY_UNAVAILABLE });
  }
});