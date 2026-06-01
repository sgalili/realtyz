// Daily 18:00 Asia/Jerusalem digest of FB engagement activity.
// Logs a one-line summary into audit_logs so the broker has a daily checkpoint.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const URL_ = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(URL_, SERVICE);
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const [{ count: newCount }, { count: repliedCount }, { count: draftedCount }] = await Promise.all([
      admin.from('fb_comments').select('id', { count: 'exact', head: true }).gte('fetched_at', since).eq('status', 'new'),
      admin.from('fb_comment_replies').select('id', { count: 'exact', head: true }).gte('posted_at', since),
      admin.from('fb_comment_drafts').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('is_simulation', false),
    ]);

    const summary = `סיכום יומי FB: ${newCount || 0} תגובות חדשות, ${draftedCount || 0} טיוטות AI, ${repliedCount || 0} תשובות שנשלחו.`;
    await admin.from('audit_logs').insert({
      action: 'fb_engagement.daily_digest',
      target_table: 'fb_comments',
      details: { summary, new: newCount, drafted: draftedCount, replied: repliedCount, window_hours: 24 },
    });

    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[fb-engagement-daily-digest]', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
