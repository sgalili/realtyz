import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { topic, platform } = await req.json();
    if (!topic || !platform) {
      return new Response(JSON.stringify({ error: "topic and platform are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabase.auth.getUser();

    const platformRules: Record<string, string> = {
      instagram: "מקסימום 3-4 משפטים חדים. פתח בהוק חזק על הנכס. בלי האשטגים מיותרים, מותר 1-2 רלוונטיים בלבד.",
      facebook: "מקסימום 3-4 משפטים חדים. פתח בהוק חזק על הנכס. בלי האשטגים מיותרים.",
      twitter: "מקסימום 280 תווים. ישר ל'4 חדרים במחיר של 2'. בלי הקדמות.",
      x: "מקסימום 280 תווים. ישר ל'4 חדרים במחיר של 2'. בלי הקדמות.",
      whatsapp: "קצר, ישיר, סגנון מתווך-ללקוח. כאילו נשלח מהטלפון בשטח.",
    };
    const rule = platformRules[String(platform).toLowerCase()] || "קצר, חד וישיר.";

    const systemPrompt = `אתה כותב תוכן נדל"ן בסגנון של אודי ויטמן - מתווך נדל"ן ישראלי, חד, ישיר, ממוקד פתרון.

פלטפורמה: ${platform}
כללי פלטפורמה: ${rule}

ה-DNA של אודי:
- אפס פלאף. בלי "אני מקווה שיומך נעים", בלי ברכות פתיחה, בלי הסברים על מה תכף תכתוב.
- ההוק תמיד על הפתרון, לא על המוצר. דוגמה: "דירה בבשן: 4 חדרים במחיר של 2. מי בא לראות?"
- כל פוסט נגמר בקריאה ברורה לפעולה: "בוא נסגור עסקה", "דברו איתי לפרטים", "מי בא לראות?", "תתקשרו".
- בלי בולטים, בלי רשימות ממוספרות, בלי כותרות מודגשות בסגנון AI. עברית זורמת וטבעית כאילו אדם הקליד מהטלפון.
- בלי אימוג'ים מוגזמים. מותר 1-2 לכל היותר.
- בלי האשטגים מיותרים.

איסור מוחלט: אסור להזכיר פוליטיקה, מפלגות, מועמדים, בחירות, או כל הקשר לא-נדל"ני. אתה כותב על נדל"ן בלבד.

כתוב בעברית בלבד. החזר את הפוסט בלבד, בלי הסברים נלווים.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `כתוב פוסט על הנושא: ${topic}` },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted, please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    let content: string = data.choices?.[0]?.message?.content || "";

    // Persona post-processing: strip bullets/markdown, collapse blank lines
    content = content
      .replace(/^\s*[-*•]\s+/gm, "")
      .replace(/^\s*\d+[\.)]\s+/gm, "")
      .replace(/[#*_`]+/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Hard char cap for X/Twitter
    const p = String(platform).toLowerCase();
    if ((p === "twitter" || p === "x") && content.length > 280) {
      content = content.slice(0, 277).trimEnd() + "...";
    }

    let approvalId = null;
    if (userData.user) {
      const { data: approval } = await supabase
        .from("approval_queue")
        .insert({
          user_id: userData.user.id,
          content_type: "social_post",
          platform,
          title: `פוסט AI ממתין לאישור - ${topic}`,
          proposed_content: content,
          confidence_score: 72,
          requires_human_review: true,
          low_confidence_reason: "תוכן AI דורש אישור אנושי ואימות מול מאגר הידע לפני פרסום.",
          source_citations: [],
          metadata: { topic, strict_knowledge: true },
          created_by_ai: true,
        })
        .select("id")
        .single();
      approvalId = approval?.id ?? null;
    }

    return new Response(JSON.stringify({ content, approval_id: approvalId, requires_human_review: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-content error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
