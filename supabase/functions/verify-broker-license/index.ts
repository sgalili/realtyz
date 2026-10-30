import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { BROKER_LICENSE_PATTERN, BROKER_REGISTRY_DATASET, BROKER_REGISTRY_RESOURCE, BROKER_REGISTRY_SOURCE, INVALID_BROKER_LICENSE, BROKER_REGISTRY_UNAVAILABLE, exactRegistryRecord, registrySourceIsFresh } from '../_shared/brokerRegistry.ts';

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
  const { licenseNumber, action } = parsed.data;
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
  }
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
    const record = exactRegistryRecord(results.records, licenseNumber);
    if (!record) return reply({ valid: false, error: 'license_not_found', message: INVALID_BROKER_LICENSE });
    if (action === 'verify') {
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!key || !url || !userId) throw new Error('registry_unavailable');
      const admin = createClient(url, key);
      const { data: sms } = await admin.from('broker_sms_verifications').select('phone_number').eq('user_id', userId).maybeSingle();
      const { data: authAccount } = await admin.auth.admin.getUserById(userId);
      if (!sms || !authAccount.user?.phone_confirmed_at || sms.phone_number !== String(authAccount.user.phone ?? '').replace(/\D/g, '')) return reply({ valid: false, error: 'sms_required', message: 'יש להשלים אימות SMS לפני אימות הרישיון' }, 403);
      const { data: profile } = await admin.from('profiles').select('full_name').eq('id', userId).maybeSingle();
      const { data: previous } = await admin.from('broker_license_verifications').select('account_name_before_verification').eq('user_id', userId).maybeSingle();
      const accountName = previous?.account_name_before_verification || profile?.full_name || '';
      const { error: registryError } = await admin.from('official_brokers_registry').upsert({ license_number: licenseNumber, holder_name: record['שם המתווך'], source_url: BROKER_REGISTRY_SOURCE, source_updated_at: updatedAt, checked_at: new Date().toISOString() });
      if (registryError) throw new Error('registry_not_saved');
      const { error } = await admin.from('broker_license_verifications').upsert({ user_id: userId, license_number: licenseNumber, registry_holder_name: record['שם המתווך'], account_name_before_verification: accountName, source_url: BROKER_REGISTRY_SOURCE, source_updated_at: updatedAt, verified_at: new Date().toISOString() });
      if (error) throw new Error('verification_not_saved');
      const { error: completeError } = await admin.rpc('complete_official_license_verification', { _uid: userId, _number: licenseNumber });
      if (completeError) throw new Error('verification_not_completed');
      const { error: affiliateError } = await admin.from('affiliate_profiles').update({ license_number: licenseNumber, license_holder_name: record['שם המתווך'], license_status: 'verified', license_verified_at: new Date().toISOString(), license_rejection_reason: null }).eq('user_id', userId);
      if (affiliateError) throw new Error('affiliate_verification_not_completed');
    }
    // Do not expose registry holders' personal information through this endpoint.
    return reply({ valid: true, source: BROKER_REGISTRY_SOURCE, updatedAt });
  } catch {
    return reply({ valid: false, error: 'registry_unavailable', message: BROKER_REGISTRY_UNAVAILABLE });
  }
});