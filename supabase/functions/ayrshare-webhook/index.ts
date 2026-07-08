// Public Ayrshare webhook receiver. Logs events and immediately fans out to
// native Facebook post/comment sync so new comments/replies/counters appear in
// the UI via Realtime without waiting for a manual refresh.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_OWNER_ID = '8f66ac1a-070a-4485-ac3b-07697d6c4b9e';

const extractPostIds = (root: any): string[] => {
  const ids = new Set<string>();
  const seen = new Set<any>();
  const add = (value: unknown) => {
    const s = typeof value === 'string' ? value.trim() : '';
    if (/^\d{5,}_\d{5,}$/.test(s) || /^pfbid[0-9A-Za-z]+$/.test(s)) ids.add(s);
  };
  const visit = (node: any) => {
    if (node == null || seen.has(node)) return;
    if (typeof node === 'string') {
      add(node);
      const share = node.match(/facebook\.com\/share\/p\/([^/?#\s"'<]+)/i)?.[1];
      if (share) ids.add(decodeURIComponent(share).replace(/\/+$/, ''));
      return;
    }
    if (typeof node !== 'object') return;
    seen.add(node);
    add(node.postId); add(node.post_id); add(node.external_post_id); add(node.parentPostId); add(node.id);
    Object.values(node).forEach(visit);
  };
  visit(root);
  return Array.from(ids).slice(0, 20);
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
      const { data: workspaceProfile } = await admin
        .from('workspace_social_profile')
        .select('id')
        .eq('ayrshare_ref_id', refId)
        .maybeSingle();
      if (workspaceProfile?.id) {
        const { data: ownerRow } = await admin
          .from('workspace_memberships')
          .select('workspace_owner_id')
          .eq('role', 'owner')
          .limit(1)
          .maybeSingle();
        userId = ownerRow?.workspace_owner_id ?? DEFAULT_OWNER_ID;
      }
    }
    userId = userId ?? DEFAULT_OWNER_ID;

    await admin.from('ayrshare_webhook_events').insert({
      user_id: userId,
      ayrshare_ref_id: refId,
      event_type: eventType,
      platform,
      payload,
    });

    const postIds = extractPostIds(payload);
    const shouldSync = String(platform || '').includes('facebook') || /comment|reply|like|share|reaction|post/i.test(String(eventType));
    if (shouldSync) {
      const syncTask = (async () => {
        if (postIds.length > 0) {
          await fetch(`${SUPABASE_URL}/functions/v1/ayrshare-comments-fetch`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, post_ids: postIds, platform: 'facebook', force_refresh: true }),
          }).catch((e) => console.error('[ayrshare-webhook] comments sync failed', e));
        }
        await fetch(`${SUPABASE_URL}/functions/v1/fb-recent-posts`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, lastRecords: 50, pageSize: 50, persist: true, sync_comments: true, force_provider_probe: true }),
        }).catch((e) => console.error('[ayrshare-webhook] recent post sync failed', e));
      })();
      // @ts-ignore Deno edge runtime background tasks.
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(syncTask);
      else await syncTask;
    }

    return new Response(JSON.stringify({ ok: true, sync_queued: shouldSync, post_ids: postIds.length }), {
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
