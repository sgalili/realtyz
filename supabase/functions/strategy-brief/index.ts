import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { candidate, election_type, tone, mandate_target, months_to_election, hot_list_count, cold_list_count } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const votersPerMandate = 30000;
    const targetVoters = (mandate_target ?? 2) * votersPerMandate;
    const projectedHot = Math.round((hot_list_count ?? 0) * 0.4);
    const projectedCold = Math.round((cold_list_count ?? 0) * 0.1);
    const gap = Math.max(0, targetVoters - projectedHot - projectedCold);

    const systemPrompt = `אתה אסטרטג קמפיין בכיר. צור Brief אסטרטגי קצר ומעשי בעברית למתעניין.
החזר JSON בלבד:
{
  "headline": "כותרת ראשית מעוררת השראה (עד 12 מילים)",
  "thesis": "התזה האסטרטגית של הקמפיין במשפט אחד",
  "pillars": ["3-4 עמודי תווך אסטרטגיים, כל אחד 8-15 מילים"],
  "next_actions": ["3-4 פעולות קונקרטיות ל-30 הימים הקרובים"],
  "risks": ["2-3 סיכונים עיקריים שצריך לנטר"],
  "signature_message": "הודעת חתימה אישית של 2-3 משפטים שתישלח לבוחרים חמים"
}
טון: ${tone}. אל תוסיף markdown או backticks - רק JSON.`;

    const userPrompt = `מתעניין/חברה: ${candidate}
סוג בחירות: ${election_type}
יעד מנדטים: ${mandate_target} (~${targetVoters.toLocaleString()} בוחרים נדרשים)
חודשים עד הבחירות: ${months_to_election}
רשימה חמה: ${hot_list_count?.toLocaleString() ?? 0} (צפי המרה: ${projectedHot.toLocaleString()})
רשימה קרה: ${cold_list_count?.toLocaleString() ?? 0} (צפי המרה: ${projectedCold.toLocaleString()})
פער ליעד: ${gap.toLocaleString()} בוחרים`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "מגבלת בקשות" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "נדרשת הוספת קרדיטים" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content?.trim() ?? "{}";
    const cleaned = raw.replace(/^```(?:json)?\n?/gm, "").replace(/\n?```$/gm, "").trim();
    let brief;
    try { brief = JSON.parse(cleaned); } catch { brief = { headline: candidate, thesis: cleaned }; }

    return new Response(JSON.stringify({
      brief,
      stats: { targetVoters, projectedHot, projectedCold, gap, mandate_target, months_to_election },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("strategy-brief error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
