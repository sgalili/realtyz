import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { BROKER_LICENSE_PATTERN } from '../_shared/brokerRegistry.ts';
import { RegistryNameError, registryNameFailureResponse } from './lookup.ts';

import { refreshAdminRegistryName } from '../_shared/adminRegistryRefresh.ts';

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
    return reply(await refreshAdminRegistryName(admin, userId, license, identity.user.id));
  } catch (error) {
    if (error instanceof RegistryNameError) {
      const result = registryNameFailureResponse(error);
      return reply(result.body, result.status);
    }
    console.error('[admin-broker-registry-name]', { code: 'profile_update_failed' });
    return reply({ error: 'profile_update_failed', message: 'לא ניתן לעדכן את הפרופיל כרגע. נסו שוב מאוחר יותר.' }, 500);
  }
});