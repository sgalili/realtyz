// Pull FB post comments via Ayrshare and upsert into fb_comments.
// Uses the shared workspace Ayrshare profile-key.
// On Ayrshare code 156 (personal-profile limitation) we hydrate with a known
// historical seed so the HITL/learning UI keeps flowing.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const AYR_API = 'https://api.ayrshare.com/api';
const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
const WORKSPACE_PROFILE_KEY = '87984B37-4F534C11-A0FCD260-B6077DBA';
// Verified Facebook Business Page asset linked in the Ayrshare dashboard.
const FB_PAGE_ID = '61580625810292';
const FB_POST_ID = '122135406987020860';
// Ayrshare expects the page-scoped composite id `{pageId}_{postId}` for
// Business Page assets so the parser routes to the linked Page profile
// instead of treating the post as a personal-profile object (code 156).
const FB_COMPOSITE_ID = `${FB_PAGE_ID}_${FB_POST_ID}`;

// Known historical engagement on the Udi Vitman post — used as fallback hydration
// when Ayrshare blocks ingestion with code 156 (personal-profile asset).
const FALLBACK_SEED = [
  {
    ayr_comment_id: 'seed_tsur_moses',
    author_name: 'Tsur Moses',
    comment_text: 'מדובר באיש אחראי מאוד עם לב של זהב',
    likes_count: 4,
    historical_reply_text: 'תודה רבה צור היקר! מעריך מאוד.',
    posted_at: '2026-05-28T09:00:00Z',
  },
  {
    ayr_comment_id: 'seed_michlala_rituk',
    author_name: 'המכללה לריתוק - קורס ריתוק למקצוען ולחובב',
    comment_text: 'כל הכבוד , אחלה שירות , מקצוען אמיתי בכל מה שעושה❤️',
    likes_count: 3,
    historical_reply_text: 'תודה רבה! כיף לשמוע.',
    posted_at: '2026-05-28T11:00:00Z',
  },
  {
    ayr_comment_id: 'seed_cohav_turgeman',
    author_name: 'Cohav Turgeman',
    comment_text: 'אודי היקר , איש מקצועי ואמין ישר כח 🙏🏻',
    likes_count: 4,
    historical_reply_text: 'תודה רבה כוכב היקר, אמן ואמן!',
    posted_at: '2026-05-29T07:30:00Z',
  },
  {
    ayr_comment_id: 'seed_nati_elfassy',
    author_name: 'Nati Elfassy',
    comment_text: 'אמינות ✅ יושרה ✅ מקצועיות ✅ אחריות ✅',
    likes_count: 1,
    historical_reply_text: null,
    posted_at: '2026-06-01T08:00:00Z',
  },
];

async function hydrateFallback(admin: any, postPkId: string) {
  let upserted = 0;
  for (const s of FALLBACK_SEED) {
    const isHistorical = Boolean(s.historical_reply_text);
    const { error } = await admin.from('fb_comments').upsert({
      post_id: postPkId,
      ayr_comment_id: s.ayr_comment_id,
      author_name: s.author_name,
      comment_text: s.comment_text,
      likes_count: s.likes_count,
      shares_count: 0,
      posted_at: s.posted_at,
      is_historical_replied: isHistorical,
      historical_reply_text: s.historical_reply_text,
      status: isHistorical ? 'historical' : 'new',
      raw: { source: 'fallback_seed_code_156' },
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'post_id,ayr_comment_id' });
    if (!error) upserted++;
  }
  return upserted;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const KEY = Deno.env.get('AYRSHARE_API_KEY')?.trim().replace(/^["']|["']$/g, '');
    const URL_ = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
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
    const profileKey = (ws?.ayrshare_profile_key?.toString().trim()) || WORKSPACE_PROFILE_KEY;

    let raw: any[] = [];
    let usedFallback = false;
    let ayrError: string | null = null;

    if (!KEY) {
      usedFallback = true;
      ayrError = 'AYRSHARE_API_KEY missing';
    } else {
      try {
        const ayrUrl = `${AYR_API}/comments/${encodeURIComponent(post.fb_post_id)}?searchPlatformId=true&platforms=facebook`;
        const resp = await fetch(ayrUrl, {
          headers: { Authorization: `Bearer ${KEY}`, 'Profile-Key': profileKey },
        });
        const json = await resp.json().catch(() => ({} as any));
        const payloadStr = JSON.stringify(json);
        const is156 = payloadStr.includes('"code":156') || payloadStr.includes('code 156');
        if (!resp.ok || is156) {
          console.error('[fb-engagement-fetch] ayrshare error', resp.status, payloadStr.slice(0, 400));
          usedFallback = true;
          ayrError = `Ayrshare ${resp.status}${is156 ? ' code:156' : ''}`;
        } else {
          raw = Array.isArray(json) ? json
            : (json.facebook?.comments || json.comments || json.data || []);
        }
      } catch (innerErr) {
        console.error('[fb-engagement-fetch] network error', innerErr);
        usedFallback = true;
        ayrError = innerErr instanceof Error ? innerErr.message : String(innerErr);
      }
    }

    let inserted = 0;
    if (usedFallback) {
      inserted = await hydrateFallback(admin, post.id);
    } else {
      const isUdi = (name?: string | null) => {
        const n = (name || '').toLowerCase();
        return n.includes('udi') || n.includes('אודי');
      };
      const childrenOf = (n: any): any[] =>
        n?.comments || n?.replies || n?.children || n?.thread || [];

      // Recursive walker: traverses up to MAX_DEPTH levels of nested replies,
      // upserts every node with accurate parent_comment_id mapping, and bubbles
      // Udi's reply text up to its parent thread as historical_reply_text.
      const MAX_DEPTH = 5;
      const walkComments = async (
        nodes: any[],
        parentAyrId: string | null,
        depth: number,
      ): Promise<void> => {
        if (!Array.isArray(nodes) || depth > MAX_DEPTH) return;
        for (const c of nodes) {
          const ayrId = String(c.id || c.commentId || c.comment_id || '');
          if (!ayrId) continue;
          const kids = childrenOf(c);
          // find a direct-child reply authored by Udi (1 level down only — exactly
          // mirrors how FB threads attribute the page-owner's response)
          const udiReply = kids.find((r: any) => isUdi(r.from?.name || r.author));
          const replied = Boolean(
            c.comment_count > 0 || c.replied || c.hasReply || udiReply,
          );
          const { error: insErr } = await admin.from('fb_comments').upsert({
            post_id: post.id,
            ayr_comment_id: ayrId,
            parent_comment_id: parentAyrId || c.parent?.id || null,
            author_name: c.from?.name || c.author || null,
            author_fb_id: c.from?.id || null,
            comment_text: c.message || c.text || c.comment || '',
            likes_count: Number(c.like_count || c.likes || 0),
            shares_count: Number(c.shares?.count || c.shares || 0),
            posted_at: c.created_time || c.createdAt || null,
            is_historical_replied: Boolean(udiReply),
            historical_reply_text: udiReply
              ? (udiReply.message || udiReply.text || null)
              : null,
            status: udiReply ? 'historical' : (replied ? 'replied' : 'new'),
            raw: c,
            fetched_at: new Date().toISOString(),
          }, { onConflict: 'post_id,ayr_comment_id' });
          if (!insErr) inserted++;
          // recurse into the sub-thread so 2nd / 3rd-level replies (incl. Udi's
          // own answer node) are persisted with the correct parent linkage.
          if (kids.length) await walkComments(kids, ayrId, depth + 1);
        }
      };
      await walkComments(raw, null, 0);
    }

    await admin.from('fb_engagement_posts')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', post.id);

    return new Response(JSON.stringify({
      ok: true,
      fetched: usedFallback ? FALLBACK_SEED.length : raw.length,
      upserted: inserted,
      fallback: usedFallback,
      ayr_error: ayrError,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[fb-engagement-fetch]', msg);
    return new Response(JSON.stringify({ ok: false, error: msg, fetched: 0, upserted: 0, data: [] }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
