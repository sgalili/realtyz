// Pull FB post comments via Ayrshare and upsert into fb_comments.
// Uses the shared workspace Ayrshare profile-key.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const AYR_API = 'https://api.ayrshare.com/api';
const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const KEY = Deno.env.get('AYRSHARE_API_KEY')?.trim().replace(/^["']|["']$/g, '');
    const URL_ = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!KEY) throw new Error('AYRSHARE_API_KEY missing');
    const admin = createClient(URL_, SERVICE);

    const { post_id: postRowId } = await req.json().catch(() => ({}));
    const { data: post, error: postErr } = await admin
      .from('fb_engagement_posts')
      .select('*')
      .eq(postRowId ? 'id' : 'fb_post_id', postRowId || '122135406987020860')
      .maybeSingle();
    if (postErr || !post) throw new Error('Tracked FB post not found');

    const { data: ws } = await admin
      .from('workspace_social_profile')
      .select('ayrshare_profile_key')
      .eq('id', WORKSPACE_ID)
      .maybeSingle();
    const profileKey = ws?.ayrshare_profile_key?.toString().trim();
    if (!profileKey) throw new Error('Workspace Ayrshare profile not connected');

    // GET /comments/{id}?searchPlatformId=true&platforms=facebook
    const ayrUrl = `${AYR_API}/comments/${encodeURIComponent(post.fb_post_id)}?searchPlatformId=true&platforms=facebook`;
    const resp = await fetch(ayrUrl, {
      headers: { Authorization: `Bearer ${KEY}`, 'Profile-Key': profileKey },
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('[fb-engagement-fetch] ayrshare error', resp.status, json);
      throw new Error(`Ayrshare ${resp.status}: ${JSON.stringify(json).slice(0, 300)}`);
    }

    // Ayrshare returns either an array or { facebook: { comments: [...] } }
    const raw = Array.isArray(json) ? json
      : (json.facebook?.comments || json.comments || json.data || []);

    let inserted = 0;
    for (const c of raw as any[]) {
      const ayrId = String(c.id || c.commentId || c.comment_id || '');
      if (!ayrId) continue;
      const replied = Boolean(
        c.user_likes ? false : (c.comment_count > 0 || c.replied || c.hasReply),
      );
      // Detect a historical reply by Udi inside child comments if Ayrshare returned them
      const childReplies: any[] = c.comments || c.replies || [];
      const udiReply = childReplies.find((r) => {
        const name = (r.from?.name || r.author || '').toLowerCase();
        return name.includes('udi') || name.includes('אודי');
      });

      const { error: insErr } = await admin.from('fb_comments').upsert({
        post_id: post.id,
        ayr_comment_id: ayrId,
        parent_comment_id: c.parent?.id || null,
        author_name: c.from?.name || c.author || null,
        author_fb_id: c.from?.id || null,
        comment_text: c.message || c.text || c.comment || '',
        likes_count: Number(c.like_count || c.likes || 0),
        shares_count: Number(c.shares?.count || c.shares || 0),
        posted_at: c.created_time || c.createdAt || null,
        is_historical_replied: Boolean(udiReply),
        historical_reply_text: udiReply ? (udiReply.message || udiReply.text || null) : null,
        status: udiReply ? 'historical' : (replied ? 'replied' : 'new'),
        raw: c,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'post_id,ayr_comment_id' });
      if (!insErr) inserted++;
    }

    await admin.from('fb_engagement_posts').update({ last_synced_at: new Date().toISOString() }).eq('id', post.id);

    return new Response(JSON.stringify({ ok: true, fetched: raw.length, upserted: inserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[fb-engagement-fetch]', msg);
    // Soft-fail: return 200 with empty dataset so UI doesn't hard-crash
    return new Response(JSON.stringify({ ok: false, error: msg, fetched: 0, upserted: 0, data: [] }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
