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

    const systemPrompt = `אתה כותב תוכן פוליטי מקצועי, מבוסס עובדות, חד ומכובד.
כתוב פוסט עבור הפלטפורמה: ${platform}.
הפוסט צריך לכלול:
- כותרת תופסת עין
- עמדה ברורה על הנושא
- טון מכבד אך נחרץ
- האשטגים רלוונטיים בעברית
- אורך מותאם לפלטפורמה (טוויטר = קצר, פייסבוק = ארוך יותר, וואטסאפ = ישיר וקצר)
מדיניות Strict-Knowledge: אל תטען עובדות ספציפיות ללא מקור מאומת ממאגר הידע; אם הביטחון נמוך, ציין שהתוכן דורש בדיקה ידנית.
שום תוכן אינו מתפרסם אוטומטית - הוא חייב לעבור אישור אנושי.
כתוב בעברית בלבד, בלי להתייחס לדמות פוליטית ספציפית אלא אם המשתמש ביקש זאת במפורש.`;

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
    const content = data.choices?.[0]?.message?.content || "";

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
