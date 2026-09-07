// KB-only chat: retrieves chunks from the user's knowledge base via kb-query
// and answers strictly using that context (no outside knowledge).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { internalMasterPrompt } from "../_shared/masterAgentPrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lastUser = [...messages].reverse().find((m: any) => m.role === "user");
    const query = (lastUser?.content ?? "").toString().slice(0, 2000);

    // Retrieve KB chunks via kb-query (keyword overlap)
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const kbResp = await fetch(`${SUPABASE_URL}/functions/v1/kb-query`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ query, match_count: 8, target_user_id: user.id }),
    });
    const kbJson = await kbResp.json().catch(() => ({}));
    const matches: Array<{ document_title: string; content: string }> = kbJson?.matches ?? [];

    const context = matches.length
      ? matches.map((m, i) => `[#${i + 1} ${m.document_title}]\n${m.content}`).join("\n\n---\n\n")
      : "";

    // Try to extract a first name from the latest user message (Hebrew "אני X" / "קוראים לי X" / English "I'm X")
    let leadName = "";
    try {
      const txt = (lastUser?.content ?? "").toString();
      const m = txt.match(/(?:קוראים לי|אני|שמי|my name is|i am|i'm)\s+([A-Za-z\u0590-\u05FF]{2,20})/i);
      if (m) leadName = m[1];
    } catch (_) { /* noop */ }

    // Persona + identity are resolved from the CALLER'S ACTIVE WORKSPACE only.
    // Nothing about any other broker may ever leak into this prompt.
    let ownerName = "";
    let personaBlock = "";
    try {
      const { data: me } = await admin
        .from("profiles")
        .select("full_name, active_workspace_owner_id")
        .eq("id", user.id)
        .maybeSingle();
      const ownerId = (me as any)?.active_workspace_owner_id ?? user.id;
      let ownerRow: any = me;
      if (ownerId && ownerId !== user.id) {
        const { data: owner } = await admin
          .from("profiles")
          .select("full_name")
          .eq("id", ownerId)
          .maybeSingle();
        ownerRow = owner ?? me;
      }
      ownerName = String(ownerRow?.full_name ?? "").trim();
      const { data: persona } = await admin
        .from("agent_personas")
        .select("tone, tone_custom, professional_bio, selling_philosophy, signature, language")
        .eq("user_id", ownerId)
        .maybeSingle();
      if (persona) {
        personaBlock = [
          (persona as any).tone ? `סגנון: ${(persona as any).tone}` : "",
          (persona as any).tone_custom ? `הנחיות סגנון: ${(persona as any).tone_custom}` : "",
          (persona as any).professional_bio ? `רקע מקצועי: ${(persona as any).professional_bio}` : "",
          (persona as any).selling_philosophy ? `תפיסת מכירה: ${(persona as any).selling_philosophy}` : "",
          (persona as any).signature ? `חתימה: ${(persona as any).signature}` : "",
        ].filter(Boolean).join("\n");
      }
    } catch (_) { /* generic persona is an acceptable fallback */ }

    const systemPrompt = [
      ownerName
        ? `אתה ה-AI Agent של ${ownerName}, מתווך נדל"ן ב-Realtyz. ברירת מחדל: ברוקר חד, יעיל, החלטי. אתה מנהל פתרונות - לא 'עונה על שאלות'.`
        : "אתה ה-AI Agent של המשרד ב-Realtyz. ברירת מחדל: ברוקר חד, יעיל, החלטי. אתה מנהל פתרונות - לא 'עונה על שאלות'.",
      "מיקוד 100%: הנכס, העסקה, וצרכי הלקוח. בלי סיפורי רקע אישיים.",
      "טון: ישיר, ישראלי, תכליתי. בלי פתיחות AI ('אשמח לעזור', 'כמודל שפה'), בלי התנצלויות.",
      "מבנה: 1-2 משפטים חדים. בלי פסקאות, בלי בולטים, בלי כותרות, בלי מקפים ארוכים. עובדה ראשונה, ואז קריאה לפעולה.",
      leadName ? `פנה ללקוח בשמו הפרטי (${leadName}).` : "אם ידוע שם פרטי של הלקוח - פתח בו.",
      "כל תשובה חייבת להסתיים בקריאה לפעולה: פגישה, סיור בנכס, חתימה, או החלטה ספציפית.",
      "בלעדיות: נכס צריך מתווך אחד מפוקס - אחרת אין תוצאות. משפט אחד, בלי דרשות.",
      "אסור להמציא נכסים, לקוחות, כתובות, מחירים או עסקאות שלא במאגר הידע של המשרד הזה.",
      "אסור לומר 'אני לא יודע על נדל\"ן'. תמיד מציע צעד הבא.",
      personaBlock ? `\nהפרסונה של המשרד:\n${personaBlock}` : "",
      "",
      context ? `הקשר ממאגר הידע:\n${context}` : "אין הקשר ספציפי במאגר - ענה קצר וחד, ובקש פרט אחד שיקדם את העסקה.",
    ].filter(Boolean).join("\n");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: internalMasterPrompt({ surface: "knowledge_base" }) + "\n\n" + systemPrompt },
          ...messages,
        ],
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "חרגת ממכסת הבקשות, נסה שוב בעוד רגע." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "נדרש תשלום: יש להוסיף קרדיטים ל-Lovable AI." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      throw new Error("AI gateway error");
    }

    const data = await aiResp.json();
    const content = data?.choices?.[0]?.message?.content ?? "לא התקבלה תשובה.";
    const sources = matches.map((m) => m.document_title).filter((v, i, a) => a.indexOf(v) === i);

    return new Response(JSON.stringify({ content, sources, used_chunks: matches.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("kb-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
