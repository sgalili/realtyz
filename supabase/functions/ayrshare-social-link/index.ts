// Ayrshare Business Plan social-link generator using Ayrshare's JWT SSO flow.
// Uses the saved workspace profileKey to open the social-connect URL.
// SAFETY: only operates on profiles whose refId starts with "realtyz-".

import { createClient } from 'npm:@supabase/supabase-js@2';
import { cleanProfileKey, isAyrshareInvalidProfileKey } from '../_shared/ayrshare-helpers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const AYR_API = 'https://api.ayrshare.com/api';
const REALTYZ_PREFIX = 'realtyz-';
const AYRSHARE_INTEGRATION_DOMAIN = 'id-yPFiJ';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizePrivateKey(value: string) {
  const cleaned = value
    .trim()
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  const headerMatch = cleaned.match(/-----BEGIN [^-]+-----/);
  const footerMatch = cleaned.match(/-----END [^-]+-----/);
  if (!headerMatch || !footerMatch) return cleaned;

  const header = headerMatch[0];
  const footer = footerMatch[0];
  const body = cleaned
    .slice(headerMatch.index! + header.length, cleaned.indexOf(footer))
    .replace(/\s+/g, '');

  const lines = body.match(/.{1,64}/g) || [];
  return [header, ...lines, footer].join('\n');
}

function normalizeDomain(value: string | undefined | null) {
  const raw = (value || '').trim().replace(/^['"`]+|['"`]+$/g, '');
  const fromQuery = raw.match(/[?&]domain=([^&]+)/i)?.[1];
  const candidate = decodeURIComponent(fromQuery || raw)
    .replace(/^https?:\/\//i, '')
    .replace(/\.ayrshare\.com.*$/i, '')
    .replace(/\/.*$/g, '')
    .trim();

  // If the secret was set to the public site domain by mistake, fall back to
  // the integration-package domain uploaded for this workspace.
  if (!candidate || candidate.includes('.') || !/^[a-z0-9-]+$/i.test(candidate)) {
    return AYRSHARE_INTEGRATION_DOMAIN;
  }
  return candidate;
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

    let profileKey = cleanProfileKey(ws?.ayrshare_profile_key) || null;
    let refId = cleanProfileKey(ws?.ayrshare_ref_id) || null;

    if (profileKey) {
      const verifyRes = await fetch(`${AYR_API}/user`, {
        headers: { Authorization: `Bearer ${AYRSHARE_API_KEY}`, 'Profile-Key': profileKey },
      });
      const verifyPayload = await verifyRes.json().catch(() => ({}));
      if (isAyrshareInvalidProfileKey(verifyRes.status, verifyPayload)) {
        console.error('[ayrshare-social-link] stored workspace profile key rejected; provisioning replacement', {
          refId,
          status: verifyRes.status,
          code: verifyPayload?.code,
          message: verifyPayload?.message ?? verifyPayload?.error,
        });
        profileKey = null;
        refId = null;
      }
    }

    // ---- SAFETY GUARD: only touch realtyz- prefixed profiles ----
    if (refId && !refId.startsWith(REALTYZ_PREFIX)) {
      console.warn('[ayrshare-social-link] refusing to act on non-realtyz refId', { refId });
      return jsonResponse({
        error: `Safety guard: workspace is linked to an Ayrshare profile (refId="${refId}") that is not managed by Realtyz.`,
      }, 403);
    }

    // ---- ZERO-ORPHAN POLICY ----
    // Before provisioning a new profile, list every realtyz- profile that
    // exists on the Ayrshare account and DELETE any that are:
    //   (a) suspended / dangling (no active social accounts), OR
    //   (b) not the workspace's currently-saved profileKey.
    // This keeps the account at exactly ONE active master profile per
    // workspace and prevents fresh suspensions from stacking up.
    if (!profileKey) {
      try {
        const listRes = await fetch(`${AYR_API}/profiles`, {
          headers: { Authorization: `Bearer ${AYRSHARE_API_KEY}` },
        });
        const listData = await listRes.json().catch(() => ({}));
        const all: any[] = Array.isArray(listData?.profiles)
          ? listData.profiles
          : Array.isArray(listData) ? listData : [];
        const realtyzProfiles = all.filter(
          (p) => typeof p?.refId === 'string' && p.refId.startsWith(REALTYZ_PREFIX),
        );
        console.log('[ayrshare-social-link] orphan scan', {
          total: all.length,
          realtyz: realtyzProfiles.length,
        });
        for (const orphan of realtyzProfiles) {
          const orphanKey: string | undefined = orphan?.profileKey;
          const orphanRef: string | undefined = orphan?.refId;
          if (!orphanKey) continue;
          try {
            const delRes = await fetch(`${AYR_API}/profiles/profile`, {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${AYRSHARE_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ profileKey: orphanKey }),
            });
            const delPayload = await delRes.json().catch(() => ({}));
            console.log('[ayrshare-social-link] purged orphan profile', {
              refId: orphanRef,
              status: delRes.status,
              ok: delRes.ok,
              message: delPayload?.message ?? null,
            });
          } catch (delErr) {
            console.warn('[ayrshare-social-link] purge failed', orphanRef, delErr instanceof Error ? delErr.message : String(delErr));
          }
        }
        // Wipe stale local rows so we never read a deleted profileKey again.
        await admin
          .from('workspace_social_profile')
          .update({ ayrshare_profile_key: null, ayrshare_ref_id: null })
          .eq('id', WORKSPACE_ID);
      } catch (scanErr) {
        console.warn('[ayrshare-social-link] orphan scan failed', scanErr instanceof Error ? scanErr.message : String(scanErr));
      }
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
    const AYRSHARE_DOMAIN = AYRSHARE_INTEGRATION_DOMAIN;
    if (!AYRSHARE_PRIVATE_KEY) {
      return jsonResponse({ error: 'Missing AYRSHARE_PRIVATE_KEY secret.' }, 500);
    }

    const cleanKey = (profileKey || '').toString().trim().replace(/^['"`]+|['"`]+$/g, '');
    const cleanPrivateKey = normalizePrivateKey(AYRSHARE_PRIVATE_KEY);
    const cleanPlatform = platform.toLowerCase().trim();

    const jwtBody = new URLSearchParams({
      domain: AYRSHARE_DOMAIN,
      privateKey: cleanPrivateKey,
      profileKey: cleanKey,
      logout: 'true',
    });

    const jwtRes = await fetch(`${AYR_API}/profiles/generateJWT`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AYRSHARE_API_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: jwtBody.toString(),
    });
    const jwtData = await jwtRes.json().catch(() => ({}));
    if (!jwtRes.ok || !jwtData?.url) {
      const msg = (jwtData?.message || jwtData?.error || `HTTP ${jwtRes.status}`).toString();
      console.error('[ayrshare-social-link] generateJWT failed', {
        ...jwtData,
        sentDomain: AYRSHARE_DOMAIN,
        profileKeyPrefix: cleanKey.slice(0, 8),
        privateKeyHeader: cleanPrivateKey.split('\n')[0],
      });
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
