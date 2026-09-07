// Generate 3 distinct Hebrew reply drafts for a FB comment, in the voice of the
// workspace owner that owns the Facebook Page. The broker name is resolved from
// that owner's profile — never hardcoded. NO titles, no role emojis.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { fetchSystemRulesBlock } from '../_shared/system-rules.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const buildSystem = (broker: string, brokerFirst: string) => `אתה כותב בשמו של ${broker} בפייסבוק. כללים נוקשים:
- לכתוב אך ורק בעברית, גוף ראשון, קצר וישיר (1-3 משפטים).
- חתימה רק "${brokerFirst}" או "${broker}". אסור בתכלית האיסור להוסיף תארים: לא "מנכ"ל", לא "סוכן נדלן", לא "יועץ", לא "ברוקר", לא "מומחה".
- אין אימוג'ים מקצועיים, אין סלוגנים פוליטיים, אין סלוגנים פוליטיים או ז'רגון פנימי.
- אסור em-dash או "--".
- טון אנושי, חם, ישר, לא מכירתי.
- כשמופיע מחיר בשקלים יש לכתוב סימן ₪ משמאל למספר (לדוגמה ₪350).
החזר JSON בלבד בפורמט:
{"drafts":[{"text":"..."},{"text":"..."},{"text":"..."}]}
שלוש גרסאות שונות זו מזו: (1) חמה ואישית, (2) ענייני ומדויק, (3) שנון וקצר.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const URL_ = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE) throw new Error('LOVABLE_API_KEY missing');

    const { comment_id, is_simulation = false } = await req.json();
    if (!comment_id) throw new Error('comment_id required');
    const admin = createClient(URL_, SERVICE);

    const { data: comment, error } = await admin
      .from('fb_comments')
      .select('id, comment_text, author_name, historical_reply_text')
      .eq('id', comment_id)
      .maybeSingle();
    if (error || !comment) throw new Error('comment not found');

    // Resolve the Page's workspace owner, then their display name. The reply
    // voice always belongs to that owner — never to a hardcoded broker.
    let ownerId: string | null = null;
    try {
      const { data: ownerRow } = await admin
        .from('fb_engagement_settings')
        .select('user_id')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      ownerId = (ownerRow as any)?.user_id ?? null;
    } catch (e) {
      console.warn('[fb-engagement-draft] owner lookup failed:', e instanceof Error ? e.message : e);
    }

    let broker = 'המתווך';
    if (ownerId) {
      try {
        const { data: prof } = await admin
          .from('profiles')
          .select('full_name')
          .eq('id', ownerId)
          .maybeSingle();
        const nm = String((prof as any)?.full_name ?? '').trim();
        if (nm) broker = nm;
      } catch (_) { /* generic fallback */ }
    }
    const brokerFirst = broker.split(/\s+/)[0];

    const userMsg = is_simulation && comment.historical_reply_text
      ? `תגובה של ${comment.author_name || 'גולש'}: "${comment.comment_text}"\n\nהתשובה של ${brokerFirst} בפועל היתה: "${comment.historical_reply_text}".\nהפק 3 גרסאות חלופיות בסגנונו.`
      : `תגובה של ${comment.author_name || 'גולש'}: "${comment.comment_text}"\n\nהפק 3 גרסאות תשובה שונות בסגנונו של ${brokerFirst}.`;

    let systemRulesBlock = '';
    if (ownerId) {
      try {
        systemRulesBlock = await fetchSystemRulesBlock(ownerId, comment.comment_text || 'facebook comment reply');
      } catch (e) {
        console.warn('[fb-engagement-draft] fetchSystemRulesBlock failed:', e instanceof Error ? e.message : e);
      }
    }

    const SYSTEM = buildSystem(broker, brokerFirst);
    const finalSystem = systemRulesBlock ? `${systemRulesBlock}\n\n${SYSTEM}` : SYSTEM;
    const finalUser = systemRulesBlock
      ? `${userMsg}\n\nכל גרסה חייבת לציית במלואה לכל הכללים תחת #CRITICAL_SYSTEM_PREFERENCES — אל תפר אף כלל.`
      : userMsg;

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: finalSystem },
          { role: 'user', content: finalUser },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      throw new Error(`AI gateway ${aiRes.status}: ${t.slice(0, 200)}`);
    }
    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content || '{}';
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = { drafts: [] }; }
    const drafts: string[] = (parsed.drafts || [])
      .map((d: any) => (typeof d === 'string' ? d : d?.text))
      .filter((t: any) => typeof t === 'string' && t.trim())
      .slice(0, 3);

    if (drafts.length === 0) throw new Error('AI returned no drafts');

    // Replace existing non-final drafts for this comment + simulation flag
    await admin.from('fb_comment_drafts')
      .delete()
      .eq('comment_id', comment_id)
      .eq('is_simulation', is_simulation);

    const rows = drafts.map((text, idx) => ({
      comment_id,
      draft_index: idx,
      draft_text: text,
      model: 'google/gemini-2.5-flash',
      is_simulation,
    }));
    await admin.from('fb_comment_drafts').insert(rows);

    if (!is_simulation) {
      await admin.from('fb_comments').update({ status: 'drafted' }).eq('id', comment_id).eq('status', 'new');
    }

    return new Response(JSON.stringify({ ok: true, drafts: rows }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[fb-engagement-draft]', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
