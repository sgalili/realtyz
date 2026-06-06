import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  adminClient,
  loadKbSnippets,
  loadCrmSnapshot,
  renderKbBlock,
  renderCrmBlock,
  UDI_PERSONA,
  ANTI_SPAM_RULES,
  CTA_RULE,
} from "../_shared/grounding.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { topic, platform, customInstructions, selectedListingId } = await req.json();
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
    const userId = userData?.user?.id ?? null;

    // Mandatory grounding: workspace KB + live CRM/listings snapshot.
    const admin = adminClient();
    const [kb, snap] = await Promise.all([
      loadKbSnippets(admin, userId),
      loadCrmSnapshot(admin, userId),
    ]);

    const platformRules: Record<string, string> = {
      instagram: "3-4 משפטים חדים. פתח בהוק קונקרטי על נכס/אזור מתוך ההקשר. 0-1 האשטגים רלוונטיים בלבד.",
      facebook: "3-5 משפטים. פתיחה ספציפית מתוך הנתונים החיים. שפה מקצועית-נגישה.",
      twitter: "מקסימום 280 תווים. ישיר, ממוקד, בלי הקדמות.",
      x: "מקסימום 280 תווים. ישיר, ממוקד, בלי הקדמות.",
      whatsapp: "קצר, ישיר, סגנון מתווך-ללקוח שנשלח מהטלפון.",
      linkedin: "5-7 משפטים בטון יועץ בכיר. תובנה אחת + CTA אחד.",
    };
    const rule = platformRules[String(platform).toLowerCase()] || "קצר, חד, מקצועי.";

    const entropySeed = `${crypto.randomUUID()}-${Date.now()}`;

    const systemPrompt = `${UDI_PERSONA}

פלטפורמה: ${platform}
כללי פלטפורמה: ${rule}

GROUNDING POLICY (אפס סובלנות לפיברוק):
- אסור להמציא נכסים, ערים, מחירים, פיצ'רים או נתונים שלא מופיעים במפורש ב-[LIVE PROPERTIES & CRM CONTEXT] או ב-[WORKSPACE KNOWLEDGE BASE].
- אם אין נכס ספציפי שמתאים לנושא, דבר מעמדה של מומחיות כללית מתוך ה-KB (תובנת שוק, טיפ ליועץ, ניסיון מהשטח) — בלי להמציא נכס פיקטיבי.
- אם מצוטט נכס/עיר/מחיר, חייבים להופיע מילולית במאגר החי שלמעלה.

${ANTI_SPAM_RULES}

${CTA_RULE}
- ה-CTA מזמין פנייה ב-Messenger / WhatsApp / טלפון למשרד — מנוסח אחרת בכל פוסט.

איסור מוחלט: פוליטיקה, מפלגות, בחירות, או כל הקשר לא-נדל"ני.

כתוב בעברית בלבד, ישראלית טבעית. החזר את הפוסט בלבד, בלי הסברים נלווים.`;

    const userPrompt = [
      renderCrmBlock(snap),
      renderKbBlock(kb),
      `נושא הפוסט: ${topic}`,
      `Anti-spam entropy seed (vary opener / structure / CTA vs any prior post): ${entropySeed}`,
      `Write the post now — grounded strictly in the two context blocks above.`,
    ].join("\n\n");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 1.0,
        top_p: 0.95,
        presence_penalty: 0.7,
        frequency_penalty: 0.85,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted, please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    let content: string = data.choices?.[0]?.message?.content || "";

    // Persona post-processing: strip bullets/markdown/dashes, collapse blank lines.
    content = content
      .replace(/^\s*[-*•]\s+/gm, "")
      .replace(/^\s*\d+[\.)]\s+/gm, "")
      .replace(/[#*_`]+/g, "")
      .replace(/[—–]/g, ",")
      .replace(/--+/g, ",")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const p = String(platform).toLowerCase();
    if ((p === "twitter" || p === "x") && content.length > 280) {
      content = content.slice(0, 277).trimEnd() + "...";
    }

    let approvalId: string | null = null;
    if (userData.user) {
      const { data: approval } = await supabase
        .from("approval_queue")
        .insert({
          user_id: userData.user.id,
          content_type: "social_post",
          platform,
          title: `פוסט AI ממתין לאישור - ${topic}`,
          proposed_content: content,
          confidence_score: 78,
          requires_human_review: true,
          low_confidence_reason: "תוכן AI דורש אישור אנושי ואימות מול מאגר הידע לפני פרסום.",
          source_citations: [],
          metadata: {
            topic,
            strict_knowledge: true,
            grounded_listings: snap?.total_listings ?? 0,
            grounded_kb_chars: kb.length,
          },
          created_by_ai: true,
        })
        .select("id")
        .single();
      approvalId = approval?.id ?? null;
    }

    return new Response(
      JSON.stringify({ content, approval_id: approvalId, requires_human_review: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-content error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
