// Lists supported platforms / current connected accounts for the broker.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { tripOnAyrshareFailure } from '../_shared/ayrshare-circuit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const AYR_API = 'https://api.ayrshare.com/api';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const KEY = Deno.env.get('AYRSHARE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!KEY) throw new Error('AYRSHARE_API_KEY missing');

    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await userClient.auth.getClaims(auth.replace('Bearer ', ''));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) throw new Error('Invalid token');

    // Fetch platform list (public networks endpoint)
    const netRes = await fetch(`${AYR_API}/profiles/v2/networks`, {
      headers: { Authorization: `Bearer ${KEY}` },
    });
    const networks = netRes.ok ? await netRes.json() : null;

    // Connected accounts for the SHARED workspace profile
    const admin = createClient(SUPABASE_URL, SERVICE);
    const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
    const { data: ws } = await admin
      .from('workspace_social_profile')
      .select('ayrshare_profile_key')
      .eq('id', WORKSPACE_ID)
      .maybeSingle();

    let connected: any[] = [];
    if (ws?.ayrshare_profile_key) {
      const userRes = await fetch(`${AYR_API}/user`, {
        headers: {
          Authorization: `Bearer ${KEY}`,
          'Profile-Key': ws.ayrshare_profile_key,
        },
      });
      if (userRes.ok) {
        const data = await userRes.json();
        connected = data.activeSocialAccounts || data.displayNames || [];

        // Cache connected platforms + capture FB page id/name when present
        const platforms = Array.isArray(data.displayNames)
          ? data.displayNames.map((a: any) => (a.platform || '').toLowerCase()).filter(Boolean)
          : [];
        const fb = Array.isArray(data.displayNames)
          ? data.displayNames.find((a: any) => (a.platform || '').toLowerCase() === 'facebook')
          : null;
        await admin
          .from('workspace_social_profile')
          .update({
            connected_platforms: platforms,
            facebook_page_id: fb?.id || fb?.pageId || null,
            facebook_page_name: fb?.displayName || fb?.username || null,
          })
          .eq('id', WORKSPACE_ID);

        // Per-user cache (kept for backward compat with existing UI)
        if (Array.isArray(data.displayNames)) {
          for (const acct of data.displayNames) {
            const platform = (acct.platform || '').toLowerCase();
            if (!platform) continue;
            await admin.from('ayrshare_social_accounts').upsert({
              user_id: userId,
              platform,
              display_name: acct.displayName || null,
              username: acct.username || null,
              profile_url: acct.userImage || null,
              connected: true,
              raw: acct,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id,platform' });
          }
        }
      } else {
        const body = await userRes.json().catch(() => ({}));
        await tripOnAyrshareFailure(admin, userRes.status, body, 'status:user');
      }
    }

    // If Ayrshare returns a partial/empty response after refresh, keep showing
    // the persisted workspace connections. Only a manual disconnect should hide
    // a previously connected platform.
    if (!Array.isArray(connected) || connected.length === 0) {
      const { data: cached } = await admin
        .from('social_connections')
        .select('platform, display_name')
        .eq('created_by', userId)
        .eq('is_connected', true);
      connected = (cached ?? []).map((row: any) => ({
        platform: row.platform === 'twitter' ? 'x' : row.platform,
        displayName: row.display_name || row.platform,
      }));
    }


    return new Response(JSON.stringify({ networks, connected }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ayrshare-status]', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
