// Ayrshare White Label social-link generator.
// Issues a JWT linking URL for the broker (creates an Ayrshare profile if needed).

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const AYR_API = 'https://api.ayrshare.com/api';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const AYRSHARE_API_KEY = Deno.env.get('AYRSHARE_API_KEY');
    const AYRSHARE_PRIVATE_KEY = Deno.env.get('AYRSHARE_PRIVATE_KEY');
    const AYR_DOMAIN = Deno.env.get('AYR_DOMAIN') || 'id-realtyz';
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // ---- Secret validation with explicit messages ----
    if (!AYRSHARE_API_KEY) {
      console.error('[ayrshare-social-link] Missing AYRSHARE_API_KEY');
      return jsonResponse({ error: 'Ayrshare API Key not configured in Supabase Secrets (AYRSHARE_API_KEY).' }, 500);
    }
    if (!AYRSHARE_PRIVATE_KEY) {
      console.error('[ayrshare-social-link] Missing AYRSHARE_PRIVATE_KEY');
      return jsonResponse({
        error:
          'Ayrshare Private Key not configured in Supabase Secrets (AYRSHARE_PRIVATE_KEY). White-label JWT linking requires the RSA private key generated in your Ayrshare dashboard → Profiles → Generate Key Pair.',
      }, 500);
    }
    if (!AYR_DOMAIN) {
      console.error('[ayrshare-social-link] Missing AYR_DOMAIN');
      return jsonResponse({ error: 'Ayrshare domain not configured (AYR_DOMAIN). Expected "id-realtyz".' }, 500);
    }

    // ---- Auth ----
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await userClient.auth.getClaims(auth.replace('Bearer ', ''));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return jsonResponse({ error: 'Invalid token' }, 401);

    // ---- Body / platform validation ----
    const body = await req.json().catch(() => ({} as any));
    const platform: string = (body?.platform || '').toString().toLowerCase().trim();
    if (!platform) {
      return jsonResponse({ error: 'Missing required "platform" parameter.' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE);

    // ---- Load profile ----
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('id, email, full_name, ayrshare_profile_key, ayrshare_ref_id')
      .eq('id', userId)
      .maybeSingle();
    if (profileErr) {
      console.error('[ayrshare-social-link] profile load failed', profileErr);
      return jsonResponse({ error: `Failed to load broker profile: ${profileErr.message}` }, 500);
    }

    let profileKey = profile?.ayrshare_profile_key as string | null;
    let refId = profile?.ayrshare_ref_id as string | null;

    // ---- Create Ayrshare profile if missing ----
    if (!profileKey) {
      refId = refId || `realtyz-${userId.slice(0, 8)}-${Date.now()}`;
      const title = profile?.full_name || profile?.email || `Realtyz ${userId.slice(0, 6)}`;
      const createRes = await fetch(`${AYR_API}/profiles/profile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AYRSHARE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          email: profile?.email || undefined,
          refId,
          domain: AYR_DOMAIN,
        }),
      });
      const created = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        console.error('[ayrshare-social-link] create profile failed', created);
        const msg = created?.message || created?.error || `HTTP ${createRes.status}`;
        return jsonResponse({ error: `Ayrshare profile create failed: ${msg}` }, 500);
      }
      profileKey = created.profileKey || created.profile?.profileKey;
      if (!profileKey) {
        console.error('[ayrshare-social-link] no profileKey in response', created);
        return jsonResponse({ error: 'Ayrshare did not return a profileKey.' }, 500);
      }
      const { error: upErr } = await admin
        .from('profiles')
        .update({ ayrshare_profile_key: profileKey, ayrshare_ref_id: refId })
        .eq('id', userId);
      if (upErr) console.error('[ayrshare-social-link] save profileKey failed', upErr);
    }

    // ---- Generate JWT URL ----
    const redirect = `https://profile.ayrshare.com/social/${platform}`;

    const jwtRes = await fetch(`${AYR_API}/profiles/generateJWT`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AYRSHARE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        domain: AYR_DOMAIN,
        privateKey: AYRSHARE_PRIVATE_KEY,
        profileKey,
        redirect,
        autoLink: true,
        autoSocialLink: true,
        hideHeader: true,
        hideFooter: true,
        hideTitle: true,
        logout: true,
        socialLink: platform,
        platform,
      }),
    });
    const jwtData = await jwtRes.json().catch(() => ({}));
    if (!jwtRes.ok) {
      console.error('[ayrshare-social-link] generateJWT failed', jwtData);
      const msg = jwtData?.message || jwtData?.error || `HTTP ${jwtRes.status}`;
      return jsonResponse({ error: `Ayrshare token generation failed: ${msg}` }, 500);
    }

    return jsonResponse({ url: jwtData.url, token: jwtData.token, profileKey, refId, redirect });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ayrshare-social-link] unexpected error', msg);
    return jsonResponse({ error: msg }, 500);
  }
});
