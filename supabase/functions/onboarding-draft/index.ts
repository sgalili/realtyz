// Generates a personalized initial outreach message for the onboarding wizard.
import { z } from "https://esm.sh/zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  candidate_or_party: z.string().min(1).max(200),
  election_type: z.enum(["general", "primaries", "municipal", "internal"]),
  mandate_target: z.number().int().min(1).max(120),
  months_to_election: z.number().int().min(1).max(48),
  tone: z.string().optional(),
});

const electionTypeLabels: Record<z.infer<typeof Body>["election_type"], string> = {
  general: "בחירות ארציות",
  primaries: "פריימריז",
  municipal: "בחירות מוניציפליות",
  internal: "בחירות פנים-מפלגתיות",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { candidate_or_party, election_type, mandate_target, months_to_election, tone } = parsed.data;

    const sys = `אתה יועץ אסטרטגי בכיר לקמפיינים פוליטיים בישראל. הסגנון שלך: מקצועי, חד, אנושי, ישיר, בלי קלישאות. אתה כותב בעברית תקנית, לא משתמש באימוג'י, פונה אישית בשם פרטי בלבד, ואינך מזכיר דמות פוליטית ספציפית.`;
    const user = `נסח הודעת פתיחה ראשונה בווטסאפ עבור הקמפיין הבא:
- מועמד/מפלגה: ${candidate_or_party}
- סוג בחירות: ${electionTypeLabels[election_type]}
- יעד מנדטים: ${mandate_target}
- חודשים עד הבחירות: ${months_to_election}
- טון מבוקש: ${tone || "חם, אותנטי, לא מתרפס"}

ההודעה צריכה:
- להיות באורך 2-4 משפטים
- לפנות אישית (בלי שם פרטי - שם אנחנו נחליף בפועל באמצעות המשתנה {full_name})
- לבקש תגובה פתוחה, לא להעמיס בקשות
- להתאים לבוחר ישראלי מתלבט

החזר רק את גוף ההודעה. בלי הקדמות, בלי הסברים.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      if (res.status === 429) {
        return new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (res.status === 402) {
        return new Response(JSON.stringify({ error: "payment_required" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await res.text();
      throw new Error(`AI gateway error ${res.status}: ${t}`);
    }

    const j = await res.json();
    const message = j?.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("onboarding-draft error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
