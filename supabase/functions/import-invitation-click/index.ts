import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { adminClient } from '../_shared/authz.ts';

// The random token only acknowledges a click: it never signs in or returns account details.
Deno.serve(async req => {
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return new Response('{}', { status: 405, headers });
  const input = z.object({ token: z.string().uuid() }).strict().safeParse(await req.json().catch(() => null));
  if (!input.success) return new Response('{}', { status: 400, headers });
  const { error } = await adminClient().from('admin_broker_onboarding').update({ invitation_clicked_at: new Date().toISOString() }).eq('invitation_link_token', input.data.token).not('first_invitation_at', 'is', null).is('invitation_clicked_at', null);
  return new Response(JSON.stringify({ ok: !error }), { status: error ? 503 : 200, headers });
});