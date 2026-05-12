// Public Ayrshare webhook receiver. Logs events for future Inbox surfacing.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE);

    const payload = await req.json().catch(() => ({} as any));
    const refId = payload.refId || payload.ref || payload.profile?.refId || null;
    const platform = (payload.platform || payload.network || '').toString().toLowerCase() || null;
    const eventType = payload.action || payload.event || payload.type || 'unknown';

    let userId: string | null = null;
    if (refId) {
      const { data } = await admin
        .from('profiles')
        .select('id')
        .eq('ayrshare_ref_id', refId)
        .maybeSingle();
      userId = data?.id ?? null;
    }

    await admin.from('ayrshare_webhook_events').insert({
      user_id: userId,
      ayrshare_ref_id: refId,
      event_type: eventType,
      platform,
      payload,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[ayrshare-webhook]', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
