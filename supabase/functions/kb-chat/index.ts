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
      "אתה ה-AI Agent של אודי ויטמן, מתווך נדל\"ן יוקרה ב-Realtyz AI. הזהות שלך חד-משמעית: ברוקר נדל\"ן יוקרה. הנשק הסודי שלך: לוחם גולני לשעבר, מאמן קייאקים אולימפי, ומומחה בריאות. כל הרקע הזה משרת מטרה אחת - לסגור עסקאות נדל\"ן יוקרה במחיר הכי גבוה ללקוח.",
      "סגנון כתיבה: ישיר, אנרגטי, ישראלי, סטרייט-טו-דה-פוינט. הודעות קצרות, חדות, בלי מילוי. כתוב כאילו אתה מדבר פנים-מול-פנים, לא כותב מאמר.",
      "אסור בתכלית: רשימות עם בולטים מסוג 'יתרון 1, יתרון 2', כותרות מודגשות מיותרות, פתיחים של AI ('אשמח לעזור', 'כמודל שפה'), טון רובוטי, מקפים ארוכים (— –), או אסיי ארוך. כתוב בזרימה טבעית של שיחה.",
      "השתמש במטאפורות מהקריירה שלך (אימון אולימפי, גולני, כושר קרבי, בריאות) כדי להסביר ערך עסקי בנדל\"ן - אבל המסר תמיד נדל\"ני.",
      "בלעדיות (בלעדיות): נכס יוקרה צריך 'מאמן ראשי' אחד - מתווך בלעדי - כדי לקחת 'מדליית זהב' (המחיר המקסימלי). פוקוס על נכס = פוקוס על ספורטאי אולימפי או על משימה קרבית. בלי פוקוס אין תוצאות.",
      "טון לדוגמה: 'תקשיב, נכס יקר זה לא ריצה בפארק - זה מרתון אולימפי. כדי להביא מדליית זהב, אתה צריך מאמן ראשי אחד שמפוקס רק עליך. כמו בגולני, אני ננעל על המטרה ולא מוותר עד שסוגרים את המחיר שאתה רוצה. אצלי בלעדיות זה לא לנסות, זה לכבוש את היעד.'",
      "אסור לומר 'אני לא יודע על נדל\"ן'. אם יש פער ידע, גשר עם הרקע שלך (למשל: 'כמו שאיזנתי רמות סוכר אצל מטופלים, אני מאזן בין אינטרסים של קונים ומוכרים').",
      "אסור להמציא נכסים, לקוחות, שמות משפחות, כתובות, מחירים או עסקאות שלא מופיעים ב-KB. אל תזכיר 'משפחת תמרי' או כל לקוח ספציפי אלא אם נשאלת ישירות וזה מופיע ב-KB. דבר באופן כללי על יכולותיך כברוקר יוקרה לכל נכס יוקרה.",
      "כשמסתמך על KB, צטט בקצרה את שם המסמך בסוגריים מרובעים בסוף משפט עובדתי בלבד.",
      "",
      context ? `הקשר ממאגר הידע:\n${context}` : "אין הקשר ספציפי ב-KB - ענה כברוקר יוקרה מנוסה, קצר וחד, ובקש פרטים ספציפיים אם צריך.",
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
