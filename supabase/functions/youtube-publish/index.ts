// supabase/functions/youtube-publish/index.ts
//
// Dedicated YouTube publishing route. YouTube NEVER goes through the Meta /
// Facebook publishing handler: this function talks straight to the YouTube
// Data API v3 with the caller's connected Google account.
//
// Flow:
//   1. Validate the caller (JWT).
//   2. Load the caller's `social_connections` row for platform = 'youtube'.
//   3. Refresh the Google access token when needed (refresh_token grant).
//   4. Fetch the video asset from its public URL.
//   5. Resumable-upload it to /upload/youtube/v3/videos with snippet + status
//      (title, description, tags, categoryId, privacyStatus, madeForKids).
//   6. Persist a campaign_logs row and return the watch URL.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

type Body = {
  video_url?: string;
  title?: string;
  description?: string;
  tags?: string[];
  privacy_status?: string;
  category_id?: string;
  made_for_kids?: boolean;
  scheduled_at?: string | null;
  campaign_name?: string;
  workspace_owner_id?: string | null;
};

async function resolveGoogleClient(admin: any, manual: Record<string, string>) {
  let clientId = manual.oauth_client_id;
  let clientSecret = manual.oauth_client_secret;
  if (!clientId || !clientSecret) {
    const { data: shared } = await admin
      .from('platform_oauth_apps')
      .select('client_id, client_secret')
      .eq('platform', 'google')
      .maybeSingle();
    if (shared?.client_id && shared?.client_secret) {
      clientId = shared.client_id;
      clientSecret = shared.client_secret;
    }
  }
  if (!clientId || !clientSecret) {
    clientId = Deno.env.get('GOOGLE_CLIENT_ID')?.trim() || clientId;
    clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')?.trim() || clientSecret;
  }
  return { clientId, clientSecret };
}

async function refreshAccessToken(params: {
  clientId: string; clientSecret: string; refreshToken: string;
}): Promise<{ access_token?: string; error?: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      refresh_token: params.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error_description || data.error || `refresh ${res.status}` };
  return { access_token: data.access_token };
}

async function uploadVideo(params: {
  accessToken: string;
  bytes: Uint8Array;
  contentType: string;
  metadata: Record<string, unknown>;
}): Promise<{ id?: string; error?: string; status?: number }> {
  const init = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(params.bytes.byteLength),
        'X-Upload-Content-Type': params.contentType,
      },
      body: JSON.stringify(params.metadata),
    },
  );
  if (!init.ok) {
    const err = await init.json().catch(() => ({}));
    return { error: err?.error?.message || `YouTube upload init failed (${init.status})`, status: init.status };
  }
  const location = init.headers.get('location') || init.headers.get('Location');
  if (!location) return { error: 'YouTube did not return a resumable upload URL' };

  const put = await fetch(location, {
    method: 'PUT',
    headers: {
      'Content-Type': params.contentType,
      'Content-Length': String(params.bytes.byteLength),
    },
    body: params.bytes,
  });
  const out = await put.json().catch(() => ({}));
  if (!put.ok) {
    return { error: out?.error?.message || `YouTube upload failed (${put.status})`, status: put.status };
  }
  return { id: out?.id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: auth } = await userClient.auth.getUser();
    if (!auth?.user) {
      return json({ success: false, error: 'יש להתחבר למערכת כדי לפרסם ל-YouTube.' });
    }
    const userId = auth.user.id;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body: Body = await req.json().catch(() => ({}));
    const videoUrl = String(body.video_url || '').trim();
    if (!/^https?:\/\//i.test(videoUrl)) {
      return json({
        success: false,
        error: 'לא נמצא קובץ וידאו לפרסום ב-YouTube. צרפו קובץ וידאו ונסו שוב.',
        code: 'missing_video',
      });
    }
    const title = String(body.title || '').trim().slice(0, 100) || 'Realtyz';
    const description = String(body.description || '').slice(0, 5000);
    const tags = Array.isArray(body.tags) ? body.tags.map((t) => String(t)).filter(Boolean).slice(0, 30) : [];
    const privacy = ['public', 'unlisted', 'private'].includes(String(body.privacy_status))
      ? String(body.privacy_status)
      : 'private';
    const categoryId = String(body.category_id || '22');
    const madeForKids = body.made_for_kids === true;

    // ── Google credentials for THIS user's YouTube connection ──────────────
    const { data: row } = await admin
      .from('social_connections')
      .select('id, credentials')
      .eq('platform', 'youtube')
      .eq('created_by', userId)
      .maybeSingle();
    const manual = (((row as any)?.credentials?.manual) ?? {}) as Record<string, string>;
    let accessToken = manual.access_token || '';
    const refreshToken = manual.refresh_token || '';
    if (!accessToken && !refreshToken) {
      return json({
        success: false,
        error: 'חשבון YouTube אינו מחובר. התחברו לחשבון Google בהגדרות החיבורים ונסו שוב.',
        code: 'not_connected',
      });
    }

    const { clientId, clientSecret } = await resolveGoogleClient(admin, manual);

    const refreshIfPossible = async () => {
      if (!refreshToken || !clientId || !clientSecret) return false;
      const r = await refreshAccessToken({ clientId, clientSecret, refreshToken });
      if (r.access_token) {
        accessToken = r.access_token;
        await admin
          .from('social_connections')
          .update({
            credentials: {
              ...((row as any)?.credentials ?? {}),
              manual: { ...manual, access_token: r.access_token },
            },
            last_test_at: new Date().toISOString(),
            last_test_status: 'ok',
          })
          .eq('platform', 'youtube')
          .eq('created_by', userId);
        return true;
      }
      return false;
    };

    if (!accessToken) {
      const ok = await refreshIfPossible();
      if (!ok) {
        return json({
          success: false,
          error: 'לא ניתן לרענן את ההרשאה של Google. חברו מחדש את חשבון YouTube.',
          code: 'auth_failed',
        });
      }
    }

    // ── Fetch the video asset ─────────────────────────────────────────────
    const assetRes = await fetch(videoUrl);
    if (!assetRes.ok) {
      return json({ success: false, error: `לא ניתן להוריד את קובץ הווידאו (${assetRes.status}).` });
    }
    const contentType = assetRes.headers.get('content-type') || 'video/mp4';
    const bytes = new Uint8Array(await assetRes.arrayBuffer());
    if (bytes.byteLength === 0) {
      return json({ success: false, error: 'קובץ הווידאו ריק.' });
    }

    const metadata: Record<string, unknown> = {
      snippet: { title, description, tags, categoryId },
      status: {
        privacyStatus: body.scheduled_at ? 'private' : privacy,
        selfDeclaredMadeForKids: madeForKids,
        ...(body.scheduled_at ? { publishAt: new Date(body.scheduled_at).toISOString() } : {}),
      },
    };

    let result = await uploadVideo({ accessToken, bytes, contentType, metadata });
    if (result.error && (result.status === 401 || result.status === 403)) {
      if (await refreshIfPossible()) {
        result = await uploadVideo({ accessToken, bytes, contentType, metadata });
      }
    }
    if (!result.id) {
      return json({ success: false, error: result.error || 'העלאת הווידאו ל-YouTube נכשלה.' });
    }

    const watchUrl = `https://www.youtube.com/watch?v=${result.id}`;
    const owner = body.workspace_owner_id || userId;
    try {
      await admin.from('campaign_logs').insert({
        user_id: owner,
        workspace_owner_id: owner,
        campaign_name: body.campaign_name || `YouTube · ${title}`,
        channel: 'youtube',
        message_body: description || title,
        media_urls: [videoUrl],
        status: body.scheduled_at ? 'scheduled' : 'sent',
        sent_at: body.scheduled_at ?? new Date().toISOString(),
        platform_post_id: result.id,
      } as any);
    } catch (e) {
      console.warn('[youtube-publish] campaign_logs insert failed', e);
    }

    return json({ success: true, video_id: result.id, url: watchUrl });
  } catch (e: any) {
    console.error('[youtube-publish] fatal', e);
    return json({ success: false, error: e?.message || 'שגיאה בפרסום ל-YouTube.' }, 200);
  }
});
