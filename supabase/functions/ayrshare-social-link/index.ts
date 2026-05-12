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

    // ---- Load broker profile ----
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

    // ---- SAFETY GUARD: only touch realtyz- prefixed profiles ----
    if (refId && !refId.startsWith(REALTYZ_PREFIX)) {
      console.warn('[ayrshare-social-link] refusing to act on non-realtyz refId', { refId });
      return jsonResponse({
        error: `Safety guard: this account is linked to an Ayrshare profile (refId="${refId}") that is not managed by Realtyz. No changes were made.`,
      }, 403);
    }

    // ---- Create Ayrshare profile if missing ----
    if (!profileKey) {
      refId = `${REALTYZ_PREFIX}${userId.slice(0, 8)}-${Date.now()}`;
      const baseName = profile?.full_name || profile?.email?.split('@')[0] || `Realtyz ${userId.slice(0, 6)}`;
      const rand = Math.floor(1000 + Math.random() * 9000).toString();
      const title = `Realtyz - ${baseName} - ${rand}`;

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
        if (isQuota) {
          return jsonResponse({ error: msg, code: 'QUOTA_EXCEEDED' }, 402);
        }
        const isDuplicate = /already exists|duplicate|exists/i.test(msg);
        if (isDuplicate) {
          // Recover only realtyz- profiles by refId
          try {
            const lookup = await fetch(`${AYR_API}/profiles?refId=${encodeURIComponent(refId)}`, {
              headers: { Authorization: `Bearer ${AYRSHARE_API_KEY}` },
            });
            const lookupData = await lookup.json().catch(() => ({}));
            const list = Array.isArray(lookupData?.profiles) ? lookupData.profiles : (Array.isArray(lookupData) ? lookupData : []);
            const match = list.find((p: any) => p.refId === refId && typeof p.refId === 'string' && p.refId.startsWith(REALTYZ_PREFIX));
            if (match?.profileKey) {
              profileKey = match.profileKey;
              console.log('[ayrshare-social-link] recovered existing realtyz- profileKey via refId');
            }
          } catch (e) {
            console.error('[ayrshare-social-link] refId lookup failed', e);
          }
          if (!profileKey) {
            const newRefId = `${REALTYZ_PREFIX}${userId.slice(0, 8)}-${Date.now()}-${rand}`;
            const retryTitle = `Realtyz - ${baseName} - ${Date.now().toString().slice(-5)}`;
            const retryRes = await fetch(`${AYR_API}/profiles/profile`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${AYRSHARE_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: retryTitle, email: profile?.email || undefined, refId: newRefId }),
            });
            const retryData = await retryRes.json().catch(() => ({}));
            if (retryRes.ok) {
              profileKey = retryData.profileKey || retryData.profile?.profileKey;
              refId = newRefId;
            } else {
              const retryMsg = (retryData?.message || retryData?.error || `HTTP ${retryRes.status}`).toString();
              console.error('[ayrshare-social-link] retry create failed', retryData);
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

      if (!profileKey) {
        return jsonResponse({ error: 'Ayrshare did not return a profileKey.' }, 500);
      }
      const { error: upErr } = await admin
        .from('profiles')
        .update({ ayrshare_profile_key: profileKey, ayrshare_ref_id: refId })
        .eq('id', userId);
      if (upErr) console.error('[ayrshare-social-link] save profileKey failed', upErr);
    }

    // ---- Re-check guard after potential creation ----
    if (!refId || !refId.startsWith(REALTYZ_PREFIX)) {
      return jsonResponse({ error: 'Safety guard: missing realtyz- refId after profile resolution.' }, 403);
    }

    // ---- Build direct Ayrshare social-link URL (Business Plan, non-white-label) ----
    // Strict trim: strip whitespace and stray surrounding quotes from the DB value.
    const cleanKey = (profileKey || '').toString().trim().replace(/^['"`]+|['"`]+$/g, '');
    const cleanPlatform = platform.toLowerCase().trim();
    const url = `https://app.ayrshare.com/social/direct?profileKey=${encodeURIComponent(cleanKey)}&network=${encodeURIComponent(cleanPlatform)}`;
    console.log('Final Redirect URL:', url);
    return jsonResponse({ url, profileKey: cleanKey, refId, platform: cleanPlatform });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[ayrshare-social-link] unexpected error', msg);
    return jsonResponse({ error: msg }, 500);
  }
});
