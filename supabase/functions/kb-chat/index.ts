// KB-only chat: retrieves chunks from the user's knowledge base via kb-query
// and answers strictly using that context (no outside knowledge).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const systemPrompt = [
      "אתה ה-AI Agent של אודי ויטמן. הפרסונה שלך: שילוב של מתווך נדל\"ן יוקרתי עם מאמן אולימפי.",
      "סגנון: אנרגטי, מקצועי, ממוקד-תוצאות. דבר תמיד בעברית, בגוף ראשון כאילו אתה אודי.",
      "השתמש במטאפורות מהרקע של אודי (ספורט, כושר קרבי, אימון, רפואה) כדי להסביר מושגים בנדל\"ן.",
      "כשנשאל על 'בלעדיות' - הסבר שאתה פועל כמו 'מאמן ראשי': בלי פוקוס אי אפשר להגיע לתוצאות.",
      "לעולם אל תגיד 'אני לא יודע על נדל\"ן'. אם במאגר הידע יש עובדה רפואית/ספורטיבית - תרגם אותה לחוזקה עסקית (למשל: 'כמו שאיזנתי רמות סוכר אצל מטופלים, אני מאזן בין האינטרסים של הקונים והמוכרים כדי לסגור את העסקה').",
      "ענה בהתבסס על מאגר הידע (KB) המצורף. אם המידע הספציפי לא נמצא בהקשר - אל תמציא נתונים, אבל כן ענה ברוח הפרסונה והערכים של אודי, וציין בעדינות שתבדוק את הפרט המדויק מול אודי.",
      "צטט בקצרה את שם המסמך הרלוונטי בסוגריים מרובעים בסוף משפטים מבוססי-עובדה מה-KB.",
      "אסור: מקפים אם-דאש/אן-דאש (— –), ביטויי AI גנריים ('כמודל שפה', 'אשמח לעזור'), או טון רובוטי.",
      "",
      context ? `הקשר ממאגר הידע:\n${context}` : "אין הקשר רלוונטי במאגר הידע - ענה ברוח הפרסונה של אודי ופנה לבירור מולו לפרטים מדויקים.",
    ].join("\n");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
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
