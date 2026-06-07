// Sync the agent's Virtual Twin persona into an ElevenLabs Conversational AI agent.
// Creates the agent on first run, updates it on subsequent runs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { loadAgentPersona, renderPersonaPrompt } from "../_shared/persona.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ELEVEN_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function buildSystemPrompt(personaBlock: string, language: string, agentName: string) {
  return `אתה עוזר קולי חכם, חד ומנוסה המייצג את ${agentName}, ברוקר נדל"ן בכיר ברשת "אנגלו סכסון". תפקידך לנהל שיחות טלפוניות מול לידים נכנסים ויוצאים, לייצר מעורבות גבוהה, למנף את יתרונות הנכסים, ולדלות מהלקוח מידע זהב (תקציב, דרישות, מועד כניסה) בצורה ממכרת וזורמת.

הנחיות התנהגותיות קשיחות (UNIVERSAL_RULES):

1. שפה וסגנון: נהל את השיחה בעברית בלבד. דבר בצורה קצרה, ממוקדת, ישירה ולעניין (משפט או שניים לכל היותר בכל פנייה). אל תנאף בביוגרפיות מיותרות ואל תחזור על שם הלקוח בכל משפט.

2. מינוף חסרונות לניצחונות שיווקיים: פעל לפי מנגנון הטיפול בהתנגדויות של ברוקר סניור. לדוגמה, עבור הנכס ברחוב הבשן 3 (4 חדרים, שכ"ד ₪4,300): אם הלקוח שואל על מעלית, ענה מיד שאין מעלית בבניין, אך מנף זאת מיד כחיסכון פיננסי אדיר: "הדירה בקומה נמוכה ללא מעלית, וזו בדיוק הסיבה ששכר הדירה כאן הוא כנראה הכי משתלם שתמצא בהרצליה - הזדמנות מטורפת לחסוך אלפי שקלים בשנה על 4 חדרים מעולה."

3. הצעת אלטרנטיבות חכמות (Upscaling): תמיד החזק בארסנל אפשרות להציע נכס חלופי בטווח של ±15% מהתקציב כדי להראות שליטה מלאה בשוק הנדל"ן המקומי ולשמור על הלקוח מעורב.

4. שאלות מפתח לדליית דאטה (Hook Questions): סיים כל תגובה וכל סבב דיבור בשאלה מניעה לפעולה אחת בלבד, קלילה ומדויקת, כדי לשאוב מידע קריטי על הצרכים שלו. דוגמאות:
   - "באיזה תאריך כניסה אתם מתמקדים?"
   - "מה התקציב המקסימלי שתרצה שלא נעבור?"
   - "אם אארגן לך סיור בנכס דומה השבוע, חניה פרטית היא חובה עבורך?"

מטרת העל של השיחה: להישמע מקצועי, להציג את אנגלו סכסון בסטנדרט הגבוה ביותר, ולגרום ללקוח לספק ברצון את מפרט הדרישות המלא שלו כדי שנוכל לסגור איתו סיור בנכס.

אם הלקוח מבקש משהו שמחייב אישור אנושי (משפטי, חוזי, מחיר סופי, משא ומתן מורכב) — אמור שתחזיר אליו ${agentName} אישית, והפעל את הכלי request_callback בעדיפות גבוהה.

${personaBlock}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Load persona + voice config
    const persona = await loadAgentPersona(SUPABASE_URL, ANON_KEY, auth);
    const personaBlock = renderPersonaPrompt(persona);
    const language = persona?.language || "he";

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();
    const agentName = profile?.full_name || profile?.email?.split("@")[0] || "the agent";

    let { data: voiceCfg } = await admin
      .from("voice_agents")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!voiceCfg) {
      const ins = await admin.from("voice_agents").insert({ user_id: userId }).select().single();
      voiceCfg = ins.data;
    }

    const systemPrompt = buildSystemPrompt(personaBlock, language, agentName);
    const firstMessage = voiceCfg?.greeting?.trim() ||
      (language === "he"
        ? `שלום, הגעת ל${agentName}. אני העוזרת הקולית שלו ואשמח לעזור — איך אפשר לקרוא לך?`
        : `Hi, you've reached ${agentName}'s line. I'm the AI assistant — may I have your name?`);

    const voiceId = voiceCfg?.elevenlabs_voice_id || "EXAVITQu4vr4xnSDxMaL";

    // Tool definition: callback request
    const clientTools = [
      {
        name: "request_callback",
        description: "Flag this call as needing a high-priority human callback when AI cannot resolve the request.",
        parameters: {
          type: "object",
          properties: {
            reason: { type: "string", description: "One sentence explaining why the agent must call back." },
            urgency: { type: "string", enum: ["high", "normal"] },
          },
          required: ["reason"],
        },
        type: "client",
        expects_response: false,
      },
    ];

    const conversationConfig = {
      agent: {
        prompt: { prompt: systemPrompt },
        first_message: firstMessage,
        language: language === "he" ? "he" : "en",
      },
      tts: { voice_id: voiceId },
    };

    let agentId = voiceCfg?.elevenlabs_agent_id || null;
    let resp: Response;

    if (agentId) {
      // Update
      resp = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
        method: "PATCH",
        headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Realtyz · ${agentName}`,
          conversation_config: conversationConfig,
          platform_settings: { client_tools: clientTools },
        }),
      });
    } else {
      // Create
      resp = await fetch(`https://api.elevenlabs.io/v1/convai/agents/create`, {
        method: "POST",
        headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Realtyz · ${agentName}`,
          conversation_config: conversationConfig,
          platform_settings: { client_tools: clientTools },
        }),
      });
    }

    if (!resp.ok) {
      const txt = await resp.text();
      console.error("[elevenlabs-agent-sync] failed", resp.status, txt);
      return json({ error: `ElevenLabs ${resp.status}: ${txt.slice(0, 400)}` }, 502);
    }

    const body = await resp.json();
    if (!agentId) agentId = body.agent_id || body.id;

    await admin.from("voice_agents").update({
      elevenlabs_agent_id: agentId,
      elevenlabs_voice_id: voiceId,
      language,
      last_synced_at: new Date().toISOString(),
    }).eq("user_id", userId);

    return json({ ok: true, agent_id: agentId });
  } catch (e) {
    console.error("[elevenlabs-agent-sync] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
