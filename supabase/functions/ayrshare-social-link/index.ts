// Ayrshare White Label social-link generator.
// Issues a JWT linking URL for the broker (creates an Ayrshare profile if needed).

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const AYR_API = 'https://api.ayrshare.com/api';
const AYR_DOMAIN = 'id-realtyz';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const AYRSHARE_API_KEY = Deno.env.get('AYRSHARE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!AYRSHARE_API_KEY) throw new Error('AYRSHARE_API_KEY missing');

    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await userClient.auth.getClaims(auth.replace('Bearer ', ''));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) throw new Error('Invalid token');

    const body = await req.json().catch(() => ({} as any));
    const platform: string = (body.platform || '').toString().toLowerCase();

    const admin = createClient(SUPABASE_URL, SERVICE);

    // Load profile
    const { data: profile } = await admin
      .from('profiles')
      .select('id, email, full_name, ayrshare_profile_key, ayrshare_ref_id')
      .eq('id', userId)
      .maybeSingle();

    let profileKey = profile?.ayrshare_profile_key as string | null;
    let refId = profile?.ayrshare_ref_id as string | null;

    // Create Ayrshare profile if missing
    if (!profileKey) {
      refId = refId || `realtyz-${userId.slice(0, 8)}-${Date.now()}`;
      const createRes = await fetch(`${AYR_API}/profiles/profile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AYRSHARE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: profile?.full_name || profile?.email || `Realtyz ${userId.slice(0, 6)}`,
          email: profile?.email || undefined,
          refId,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) {
        console.error('[ayrshare] create profile failed', created);
        throw new Error(`Ayrshare profile create failed: ${JSON.stringify(created)}`);
      }
      profileKey = created.profileKey || created.profile?.profileKey;
      if (!profileKey) throw new Error('No profileKey returned by Ayrshare');
      await admin
        .from('profiles')
        .update({ ayrshare_profile_key: profileKey, ayrshare_ref_id: refId })
        .eq('id', userId);
    }

    // Generate JWT URL via Ayrshare
    const redirect = platform
      ? `https://profile.ayrshare.com/social/${platform}`
      : 'https://profile.ayrshare.com/social';

    const jwtRes = await fetch(`${AYR_API}/profiles/generateJWT`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AYRSHARE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        domain: AYR_DOMAIN,
        privateKey: Deno.env.get('AYRSHARE_PRIVATE_KEY') || undefined,
        profileKey,
        redirect,
        autoLink: true,
        autoSocialLink: true,
        hideHeader: true,
        hideFooter: true,
        hideTitle: true,
        logout: true,
        ...(platform ? { socialLink: platform, platform } : {}),
      }),
    });
    const jwtData = await jwtRes.json();
    if (!jwtRes.ok) {
      console.error('[ayrshare] generateJWT failed', jwtData);
      throw new Error(`Ayrshare generateJWT failed: ${JSON.stringify(jwtData)}`);
    }

    return new Response(
      JSON.stringify({ url: jwtData.url, token: jwtData.token, profileKey, refId, redirect }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ayrshare-social-link] error', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
