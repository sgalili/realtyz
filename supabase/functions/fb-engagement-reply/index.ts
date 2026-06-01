// Post an approved reply to a FB comment via Ayrshare, then write the
// (comment + Udi's approved reply) pair into the Knowledge Base for future
// persona learning.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const AYR_API = 'https://api.ayrshare.com/api';
const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
const WORKSPACE_PROFILE_KEY = '87984B37-4F534C11-A0FCD260-B6077DBA';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const KEY = Deno.env.get('AYRSHARE_API_KEY');
    const URL_ = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!KEY) throw new Error('AYRSHARE_API_KEY missing');

    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userClient = createClient(URL_, ANON, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error('Invalid token');

    const { comment_id, final_text, mode = 'hitl' } = await req.json();
    if (!comment_id || !final_text) throw new Error('comment_id + final_text required');

    const admin = createClient(URL_, SERVICE);
    const { data: comment, error: cErr } = await admin
      .from('fb_comments')
      .select('id, ayr_comment_id, comment_text, author_name, post_id')
      .eq('id', comment_id).maybeSingle();
    if (cErr || !comment) throw new Error('comment not found');

    const { data: ws } = await admin
      .from('workspace_social_profile')
      .select('ayrshare_profile_key')
      .eq('id', WORKSPACE_ID).maybeSingle();
    if (!ws?.ayrshare_profile_key) throw new Error('Workspace Ayrshare profile not connected');

    // POST /comments/reply with commentId + comment + platforms
    const ayrRes = await fetch(`${AYR_API}/comments/reply`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KEY}`,
        'Profile-Key': ws.ayrshare_profile_key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        commentId: comment.ayr_comment_id,
        platforms: ['facebook'],
        comment: final_text,
      }),
    });
    const ayrJson = await ayrRes.json().catch(() => ({}));
    if (!ayrRes.ok) {
      console.error('[fb-engagement-reply] ayrshare fail', ayrRes.status, ayrJson);
      throw new Error(`Ayrshare ${ayrRes.status}: ${JSON.stringify(ayrJson).slice(0, 300)}`);
    }
    const ayrReplyId = ayrJson?.id || ayrJson?.commentId || ayrJson?.facebook?.id || null;

    // KB write-back: persona-learning Q/A pair
    const kbTitle = `FB engagement — תגובת ${comment.author_name || 'גולש'}`;
    const kbBody = `שאלה/תגובה: ${comment.comment_text}\n\nתשובה (אודי ויטמן): ${final_text}`;
    const { data: kbDoc } = await admin.from('knowledge_documents').insert({
      user_id: user.id,
      source_type: 'text',
      title: kbTitle,
      raw_text: kbBody,
      source_metadata: { source: 'fb_engagement', comment_id, ayr_comment_id: comment.ayr_comment_id, mode },
      is_active: true,
      chunk_count: 1,
    }).select('id').maybeSingle();

    if (kbDoc?.id) {
      await admin.from('knowledge_chunks').insert({
        document_id: kbDoc.id,
        user_id: user.id,
        chunk_index: 0,
        content: kbBody,
      });
      await admin.from('knowledge_documents').update({ chunk_count: 1 }).eq('id', kbDoc.id);
    }

    await admin.from('fb_comment_replies').insert({
      comment_id,
      final_text,
      mode,
      posted_by: user.id,
      ayrshare_reply_id: ayrReplyId,
      ayrshare_response: ayrJson,
      kb_document_id: kbDoc?.id ?? null,
    });

    await admin.from('fb_comments').update({ status: 'replied' }).eq('id', comment_id);

    return new Response(JSON.stringify({ ok: true, ayrshare: ayrJson, kb_document_id: kbDoc?.id ?? null }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[fb-engagement-reply]', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
