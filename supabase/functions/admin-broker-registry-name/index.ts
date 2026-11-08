import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { BROKER_LICENSE_PATTERN } from '../_shared/brokerRegistry.ts';
import { assertRegistryNameTarget, fetchRegistryName, RegistryNameError } from './lookup.ts';

const Body = z.object({ user_id: z.string().uuid(), license_number: z.string().regex(BROKER_LICENSE_PATTERN) }).strict();
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return reply({ message: 'פעולה לא נתמכת' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !key || !anon) return reply({ message: 'השירות אינו זמין כרגע' }, 503);
    const authorization = req.headers.get('authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) return reply({ message: 'יש להתחבר כדי לבצע פעולה זו' }, 401);
    const viewer = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: identity, error: authError } = await viewer.auth.getUser();
    if (authError || !identity.user) return reply({ message: 'יש להתחבר כדי לבצע פעולה זו' }, 401);
    const admin = createClient(url, key);
    const { data: role, error: roleError } = await admin.from('user_roles').select('user_id').eq('user_id', identity.user.id).eq('role', 'super_admin').maybeSingle();
    if (roleError || !role) return reply({ message: 'פעולה זו זמינה לסופר אדמין בלבד' }, 403);
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return reply({ message: 'נא להזין מספר רישיון תקין בספרות בלבד' }, 400);
    const { user_id: userId, license_number: license } = parsed.data;
    const { data: profile, error: profileError } = await admin.from('profiles').select('id,full_name,city,broker_license_number,locked_broker_name').eq('id', userId).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return reply({ message: 'הפרופיל המבוקש לא נמצא' }, 404);
    assertRegistryNameTarget(profile, license);
    const registry = await fetchRegistryName(license);
    assertRegistryNameTarget(profile, license, registry.fullName);
    // Refresh official evidence so existing name/license triggers use the same current record.
    // This never writes verification evidence, broker roles, approval status or SMS state.
    const { error: registryError } = await admin.from('official_brokers_registry').upsert({ license_number: license, holder_name: registry.rawName, display_name: registry.fullName, registry_city: registry.city, source_url: registry.source, source_updated_at: registry.updatedAt, checked_at: new Date().toISOString() });
    if (registryError) throw registryError;
    const { data: saved, error: saveError } = await admin.from('profiles').update({ full_name: registry.fullName, locked_broker_name: registry.fullName, city: registry.city || null, locked_broker_city: registry.city }).eq('id', userId).eq('broker_license_number', license).select('id,full_name,city,broker_license_number').single();
    if (saveError || !saved || saved.full_name !== registry.fullName) throw new RegistryNameError('save_failed', 'השם נשלף, אך לא ניתן היה לעדכן את הפרופיל. רעננו ונסו שוב.', 409);
    // Exact registry match confirmed by a Super Admin is official license evidence (no role grant).
    const { data: previous } = await admin.from('broker_license_verifications').select('account_name_before_verification').eq('user_id', userId).maybeSingle();
    const { error: evidenceError } = await admin.from('broker_license_verifications').upsert({ user_id: userId, license_number: license, registry_holder_name: registry.rawName, account_name_before_verification: previous?.account_name_before_verification ?? profile.full_name ?? '', source_url: registry.source, source_updated_at: registry.updatedAt, verified_at: new Date().toISOString() });
    if (evidenceError) throw evidenceError;
    await admin.from('audit_logs').insert({ action: 'admin_registry_name_refresh', actor_id: identity.user.id, target_table: 'profiles', target_id: userId, details: { source: registry.source } });
    return reply({ profile: saved, registry: { full_name: registry.fullName, city: registry.city, license_number: license }, message: 'השם המלא נשלף בהצלחה מהמאגר הממשלתי' });
  } catch (error) {
    if (error instanceof RegistryNameError) return reply({ error: error.code, message: error.message }, error.status);
    console.error('[admin-broker-registry-name]', { code: 'profile_update_failed' });
    return reply({ error: 'profile_update_failed', message: 'לא ניתן לעדכן את הפרופיל כרגע. נסו שוב מאוחר יותר.' }, 500);
  }
});