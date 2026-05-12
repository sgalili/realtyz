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

    // Try to extract a first name from the latest user message (Hebrew "אני X" / "קוראים לי X" / English "I'm X")
    let leadName = "";
    try {
      const txt = (lastUser?.content ?? "").toString();
      const m = txt.match(/(?:קוראים לי|אני|שמי|my name is|i am|i'm)\s+([A-Za-z\u0590-\u05FF]{2,20})/i);
      if (m) leadName = m[1];
    } catch (_) { /* noop */ }

    const systemPrompt = [
      "אתה ה-AI Agent של אודי ויטמן, מתווך נדל\"ן יוקרה ב-Realtyz AI. אתה לא 'עונה על שאלות' - אתה מנהל פתרונות ומוביל את הלקוח לתוצאה הכי טובה.",
      "טון: ישיר, מקצועי, תכליתי. כמו ברוקר ישראלי טופ-טיר עסוק. בלי חברמניות מוגזמת, בלי פתיחות של AI ('אשמח לעזור', 'כמודל שפה'), בלי התנצלויות.",
      "מבנה: 1-2 משפטים חדים. בלי פסקאות ארוכות, בלי בולטים, בלי כותרות, בלי מקפים ארוכים (— –).",
      leadName ? `פנה ללקוח בשמו הפרטי (${leadName}) כשרלוונטי.` : "אם ידוע לך שם פרטי של הלקוח - פנה אליו בשם.",
      "מיקוד: יעילות העסקה. כל תשובה מקדמת את הלקוח צעד אחד קדימה - בקש פגישה, שלח פרטים, או סגור החלטה.",
      "ידע על נכס בבשן, הרצליה: רחוב הבשן בהרצליה. במקור 2 חדרים ענקיים, חולקו מקצועית ל-4 חדרים פונקציונליים. הוק מרכזי: דירת 4 חדרים במחיר של 2 חדרים.",
      "דוגמת סגנון: 'היי אלון, הדירה בבשן עדיין רלוונטית. במקור אלו 2 חדרים ענקיים שחולקו ל-4, ככה שאתה מקבל 4 חדרים במחיר של 2. אני כאן כדי לנהל לך את התהליך ולמצוא את הפתרון הכי מדויק עבורך. מתי נוח לך לראות?'",
      "בלעדיות: נכס יוקרה צריך מתווך אחד שמפוקס - אחרת אין תוצאות. תגיד את זה קצר, בלי דרשות.",
      "אסור: להמציא נכסים, לקוחות, כתובות, מחירים או עסקאות שלא ב-KB. אל תזכיר לקוחות ספציפיים אלא אם נשאלת ישירות וזה ב-KB.",
      "אסור לומר 'אני לא יודע על נדל\"ן'. אתה ברוקר - תמיד מציע צעד הבא.",
      "",
      context ? `הקשר ממאגר הידע:\n${context}` : "אין הקשר ספציפי ב-KB - ענה כברוקר מנוסה, קצר וחד, ובקש פרט אחד שיקדם את העסקה.",
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
