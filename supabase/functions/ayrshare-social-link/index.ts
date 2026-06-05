// Ayrshare Business Plan social-link generator (no JWT / no white-label domain).
// Uses the saved profileKey to build a direct Ayrshare social-connect URL.
// SAFETY: only operates on profiles whose refId starts with "realtyz-".

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const AYR_API = 'https://api.ayrshare.com/api';
const REALTYZ_PREFIX = 'realtyz-';

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
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!AYRSHARE_API_KEY) {
      console.error('[ayrshare-social-link] Missing AYRSHARE_API_KEY');
      return jsonResponse({ error: 'Ayrshare API Key not configured in Supabase Secrets (AYRSHARE_API_KEY).' }, 500);
    }

    // ---- Auth ----
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return jsonResponse({ error: 'Unauthorized' }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await userClient.auth.getClaims(auth.replace('Bearer ', ''));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return jsonResponse({ error: 'Invalid token' }, 401);

    // ---- Body / platform ----
    const body = await req.json().catch(() => ({} as any));
    const platform: string = (body?.platform || '').toString().toLowerCase().trim();
    if (!platform) return jsonResponse({ error: 'Missing required "platform" parameter.' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

    // ---- Load broker profile (used for naming the workspace profile only) ----
    const { data: profile } = await admin
      .from('profiles')
      .select('id, email, full_name')
      .eq('id', userId)
      .maybeSingle();

    // ---- Load the SHARED workspace Ayrshare profile ----
    const { data: ws, error: wsErr } = await admin
      .from('workspace_social_profile')
      .select('ayrshare_profile_key, ayrshare_ref_id')
      .eq('id', WORKSPACE_ID)
      .maybeSingle();
    if (wsErr) {
      console.error('[ayrshare-social-link] workspace load failed', wsErr);
      return jsonResponse({ error: `Failed to load workspace social profile: ${wsErr.message}` }, 500);
    }

    let profileKey = (ws?.ayrshare_profile_key as string | null) || null;
    let refId = (ws?.ayrshare_ref_id as string | null) || null;

    // ---- SAFETY GUARD: only touch realtyz- prefixed profiles ----
    if (refId && !refId.startsWith(REALTYZ_PREFIX)) {
      console.warn('[ayrshare-social-link] refusing to act on non-realtyz refId', { refId });
      return jsonResponse({
        error: `Safety guard: workspace is linked to an Ayrshare profile (refId="${refId}") that is not managed by Realtyz.`,
      }, 403);
    }

    // ---- Create the shared workspace Ayrshare profile if missing ----
    if (!profileKey) {
      refId = `${REALTYZ_PREFIX}workspace-${Date.now()}`;
      const baseName = profile?.full_name || profile?.email?.split('@')[0] || 'Workspace';
      const rand = Math.floor(1000 + Math.random() * 9000).toString();
      const title = `Realtyz Workspace - ${baseName} - ${rand}`;

      const createRes = await fetch(`${AYR_API}/profiles/profile`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${AYRSHARE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, email: profile?.email || undefined, refId }),
      });
      const created = await createRes.json().catch(() => ({}));

      if (createRes.ok) {
        profileKey = created.profileKey || created.profile?.profileKey;
      } else {
        const msg: string = (created?.message || created?.error || `HTTP ${createRes.status}`).toString();
        console.error('[ayrshare-social-link] create profile failed', created);
        const isQuota = /over maximum number of user profiles|maximum.*profiles|profile.*limit|quota/i.test(msg);
        if (isQuota) return jsonResponse({ error: msg, code: 'QUOTA_EXCEEDED' }, 402);
        const isDuplicate = /already exists|duplicate|exists/i.test(msg);
        if (isDuplicate) {
          try {
            const lookup = await fetch(`${AYR_API}/profiles?refId=${encodeURIComponent(refId)}`, {
              headers: { Authorization: `Bearer ${AYRSHARE_API_KEY}` },
            });
            const lookupData = await lookup.json().catch(() => ({}));
            const list = Array.isArray(lookupData?.profiles) ? lookupData.profiles : (Array.isArray(lookupData) ? lookupData : []);
            const match = list.find((p: any) => p.refId === refId && typeof p.refId === 'string' && p.refId.startsWith(REALTYZ_PREFIX));
            if (match?.profileKey) profileKey = match.profileKey;
          } catch (e) {
            console.error('[ayrshare-social-link] refId lookup failed', e);
          }
          if (!profileKey) {
            const newRefId = `${REALTYZ_PREFIX}workspace-${Date.now()}-${rand}`;
            const retryRes = await fetch(`${AYR_API}/profiles/profile`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${AYRSHARE_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: `${title}-r`, email: profile?.email || undefined, refId: newRefId }),
            });
            const retryData = await retryRes.json().catch(() => ({}));
            if (retryRes.ok) {
              profileKey = retryData.profileKey || retryData.profile?.profileKey;
              refId = newRefId;
            } else {
              const retryMsg = (retryData?.message || retryData?.error || `HTTP ${retryRes.status}`).toString();
              if (/over maximum number of user profiles|maximum.*profiles|profile.*limit|quota/i.test(retryMsg)) {
                return jsonResponse({ error: retryMsg, code: 'QUOTA_EXCEEDED' }, 402);
              }
              return jsonResponse({ error: `Ayrshare profile create failed (retry): ${retryMsg}` }, 500);
            }
          }
        } else {
          return jsonResponse({ error: `Ayrshare profile create failed: ${msg}` }, 500);
        }
      }

      if (!profileKey) return jsonResponse({ error: 'Ayrshare did not return a profileKey.' }, 500);

      const { error: upErr } = await admin
        .from('workspace_social_profile')
        .upsert({ id: WORKSPACE_ID, ayrshare_profile_key: profileKey, ayrshare_ref_id: refId }, { onConflict: 'id' });
      if (upErr) console.error('[ayrshare-social-link] save workspace profileKey failed', upErr);
    }

    // ---- Re-check guard after potential creation ----
    if (!refId || !refId.startsWith(REALTYZ_PREFIX)) {
      return jsonResponse({ error: 'Safety guard: missing realtyz- refId after profile resolution.' }, 403);
    }

    // ---- Generate JWT-based social-link URL (Ayrshare's official flow) ----
    const AYRSHARE_PRIVATE_KEY = Deno.env.get('AYRSHARE_PRIVATE_KEY');
    const AYRSHARE_DOMAIN = Deno.env.get('AYRSHARE_DOMAIN');
    if (!AYRSHARE_PRIVATE_KEY) {
      return jsonResponse({ error: 'Missing AYRSHARE_PRIVATE_KEY secret.' }, 500);
    }
    if (!AYRSHARE_DOMAIN) {
      return jsonResponse({ error: 'Missing AYRSHARE_DOMAIN secret (Ayrshare dashboard → Profiles → Domain, e.g. "id-xxxxx").' }, 500);
    }

    const cleanKey = (profileKey || '').toString().trim().replace(/^['"`]+|['"`]+$/g, '');
    const cleanPlatform = platform.toLowerCase().trim();

    const jwtRes = await fetch(`${AYR_API}/profiles/generateJWT`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AYRSHARE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: AYRSHARE_DOMAIN,
        privateKey: AYRSHARE_PRIVATE_KEY,
        profileKey: cleanKey,
      }),
    });
    const jwtData = await jwtRes.json().catch(() => ({}));
    if (!jwtRes.ok || !jwtData?.url) {
      const msg = (jwtData?.message || jwtData?.error || `HTTP ${jwtRes.status}`).toString();
      console.error('[ayrshare-social-link] generateJWT failed', jwtData);
      return jsonResponse({ error: `Ayrshare generateJWT failed: ${msg}` }, 500);
    }

    const url = `${jwtData.url}${jwtData.url.includes('?') ? '&' : '?'}network=${encodeURIComponent(cleanPlatform)}`;
    console.log('Final Redirect URL:', url);
    return jsonResponse({ url, profileKey: cleanKey, refId, platform: cleanPlatform });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ayrshare-social-link] unexpected error', msg);
    return jsonResponse({ error: msg }, 500);
  }
});
