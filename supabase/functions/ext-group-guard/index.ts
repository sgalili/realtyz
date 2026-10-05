import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return reply({ ok: false }, 405);
  const body = await req.json().catch(() => null);
  if (!body || !/^[a-f0-9]{32,80}$/i.test(body.token || '') ||
      !/^[a-f0-9-]{36}$/i.test(body.workspace_owner_id || '') || typeof body.group !== 'string') {
    return reply({ ok: false, reason: 'invalid_request' }, 400);
  }
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return reply({ ok: false }, 500);
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.rpc('ext_group_post_guard', {
    _token: body.token, _owner: body.workspace_owner_id, _group: body.group.slice(0, 500),
    _rejection: typeof body.rejection === 'string' ? body.rejection.slice(0, 400) : null,
  });
  if (error) return reply({ ok: false, reason: 'server_error' }, 500);
  return reply(data, data?.ok ? 200 : 403);
});