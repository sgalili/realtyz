// Vapi outbound call — Realtyz real-estate port (KI parity).
//
// Cleaned payload — strips fields Vapi rejects with HTTP 400:
//   • variableValues, voter_historical_context, idleMessageMaxSpokenCount,
//     silenceTimeoutSeconds, green_api_template_modifier
//
// Transcriber keywords are emitted in canonical "word:1" weight format.
// Voice provider is locked to "11labs" (Vapi's accepted enum value).
// Assistant tools dispatch live via:
//   - send_whatsapp  -> send-whatsapp edge fn (GreenAPI / WBA)
//   - send_sms_019   -> 019 SMS XML gateway
//   - schedule_call  -> Twilio voice (via vapi-tool-handler)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeE164(raw: string): string {
  const t = (raw || "").trim();
  if (/^\+972/.test(t)) return "+972" + t.replace(/^\+972/, "").replace(/\D/g, "");
  const d = t.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("972")) return "+" + d;
  if (d.startsWith("0")) return "+972" + d.slice(1);
  if (d.length === 9) return "+972" + d;
  return "+" + d;
}

// Canonical word:weight transcriber keyword format (Vapi/Deepgram requirement).
const TRANSCRIBER_KEYWORDS = [
  "רילטיז:1",
  "נכס:1",
  "דירה:1",
  "מתעניין:1",
  "פגישה:1",
];

function buildAssistant(opts: {
  systemPrompt: string;
  firstMessage: string;
  voiceId: string;
  toolsServerUrl: string;
  leadId: string | null;
  userId: string;
}) {
  const toolHeader = { type: "header", value: opts.userId };
  const server = {
    url: opts.toolsServerUrl,
    headers: { "x-realtyz-user": opts.userId, "x-realtyz-lead": opts.leadId ?? "" },
  };
  return {
    name: "Realtyz Broker AI",
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
      language: "he",
      keywords: TRANSCRIBER_KEYWORDS, // "word:weight" canonical strings
    },
    model: {
      provider: "openai",
      model: "gpt-4o",
      maxTokens: 160,
      temperature: 0.4,
      messages: [{ role: "system", content: opts.systemPrompt }],
      tools: [
        {
          type: "function",
          server,
          function: {
            name: "send_whatsapp",
            description:
              "שולח הודעת WhatsApp ללקוח דרך Green API. השתמש כשהלקוח מבקש קישור, סיכום, או פרטי נכס בכתב.",
            parameters: {
              type: "object",
              properties: {
                phone: { type: "string", description: "טלפון בפורמט E.164 (+972...)" },
                message: { type: "string", description: "תוכן ההודעה בעברית" },
              },
              required: ["phone", "message"],
            },
          },
        },
        {
          type: "function",
          server,
          function: {
            name: "send_sms_019",
            description: "שולח SMS דרך גייטוויי 019 כאשר לקוח מעדיף SMS על פני WhatsApp.",
            parameters: {
              type: "object",
              properties: {
                phone: { type: "string" },
                message: { type: "string" },
              },
              required: ["phone", "message"],
            },
          },
        },
        {
          type: "function",
          server,
          function: {
            name: "schedule_followup",
            description: "מתזמן שיחה חוזרת או פגישה עם הלקוח דרך מערכת Twilio + יומן.",
            parameters: {
              type: "object",
              properties: {
                when_iso: { type: "string", description: "ISO datetime למועד החיוג החוזר" },
                note: { type: "string" },
              },
              required: ["when_iso"],
            },
          },
        },
      ],
    },
    voice: {
      provider: "11labs", // Vapi requires "11labs", not "elevenlabs".
      voiceId: opts.voiceId,
      model: "eleven_multilingual_v3",
      language: "he",
      stability: 0.5,
      similarityBoost: 0.85,
    },
    firstMessage: opts.firstMessage,
    maxDurationSeconds: 240,
    recordingEnabled: true,
    backgroundDenoisingEnabled: true,
    backgroundSound: "off",
    metadata: { lead_id: opts.leadId, user_id: opts.userId },
    _hdr: toolHeader, // not sent to Vapi; consumed via JSON.stringify replacer? -> we strip below.
  };
}

function genderRules(voiceGender: string | null, userGender: string | null): string {
  const lines: string[] = [];
  if (voiceGender === 'male' || voiceGender === 'female') {
    lines.push(
      voiceGender === 'male'
        ? 'מגדר הקול שלך: זכר. דבר תמיד בלשון זכר כשאתה מתאר את עצמך (אני בדקתי, אני אשלח, אני אחזור). לעולם אל תשתמש בצורת נקבה לעצמך.'
        : 'מגדר הקול שלך: נקבה. דברי תמיד בלשון נקבה כשאת מתארת את עצמך (אני בדקתי, אני אשלח, אני אחזור). לעולם אל תשתמשי בצורת זכר לעצמך.'
    );
  }
  if (userGender === 'male' || userGender === 'female') {
    lines.push(
      userGender === 'male'
        ? 'מגדר המתעניין שאליו אתה מתקשר: זכר. פנה אליו בלשון זכר (אתה מחפש, רצית, נוח לך).'
        : 'מגדר המתעניין שאליו את/ה מתקשר/ת: נקבה. פני אליה בלשון נקבה (את מחפשת, רצית, נוח לך).'
    );
  }
  if (!lines.length) {
    lines.push('זהה את מגדר המתעניין מהשם והקול בתחילת השיחה, ופנה אליו באותו מגדר עד סוף השיחה. אל תחליף מגדר באמצע השיחה.');
  }
  return lines.join('\n');
}

function buildSystemPrompt(p: {
  leadName: string;
  city: string;
  preferences: string;
  listingsBlurb: string;
  voiceGender: string | null;
  userGender: string | null;
  brokerInstructions: string | null;
}) {
  return [
    'אתה הסוכן הדיגיטלי של מתווך נדל"ן בישראל.',
    'דבר עברית טבעית, קצר ולעניין. משפט אחד בכל תור.',
    genderRules(p.voiceGender, p.userGender),
    p.leadName ? `שם הלקוח: ${p.leadName}.` : '',
    p.city ? `אזור עניין: ${p.city}.` : '',
    p.preferences ? `העדפות לקוח: ${p.preferences}` : '',
    p.listingsBlurb ? `נכסים זמינים רלוונטיים:\n${p.listingsBlurb}` : '',
    p.brokerInstructions ? `הנחיות ספציפיות מהמתווך לשיחה זו (קדימות עליונה, אל תסטה מהן):\n${p.brokerInstructions}` : '',
    'אל תמציא נכסים שלא הופיעו ברשימה. אם הלקוח מבקש קישור או פרטים בכתב, השתמש מיד בכלי send_whatsapp; אם הוא מבקש SMS, השתמש ב-send_sms_019. כאשר הלקוח מבקש לתאם פגישה או חיוג חוזר השתמש ב-schedule_followup.',
    'מטרת השיחה: לאשר עניין, להבין צרכים, ולתאם המשך (פגישה / שליחת חומר / חיוג חוזר).',
    'כללי איסור: אל תשתמש ב-em dash, en dash, או רצף --. אל תאמר ביטויים גנריים של AI.',
  ].filter(Boolean).join('\n');
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    let VAPI_API_KEY = Deno.env.get("VAPI_API_KEY") ?? "";
    let VAPI_PHONE_NUMBER_ID = Deno.env.get("VAPI_PHONE_NUMBER_ID") ?? "";
    let VAPI_ASSISTANT_ID = Deno.env.get("VAPI_ASSISTANT_ID") ?? "";
    const ELEVENLABS_VOICE_ID = Deno.env.get("ELEVENLABS_VOICE_ID") || "xeyWdsOOLrNAAaGf4Y8m";

    // Fallback: read user-saved credentials from api_configs
    if (!VAPI_API_KEY || !VAPI_PHONE_NUMBER_ID) {
      const sbCfg = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { data: cfg } = await sbCfg.from("api_configs").select("api_key").eq("service_name", "Vapi").maybeSingle();
      if (cfg?.api_key) {
        const [k, p, a] = String(cfg.api_key).split(":");
        VAPI_API_KEY = VAPI_API_KEY || (k ?? "");
        VAPI_PHONE_NUMBER_ID = VAPI_PHONE_NUMBER_ID || (p ?? "");
        VAPI_ASSISTANT_ID = VAPI_ASSISTANT_ID || (a ?? "");
      }
    }

    if (!VAPI_API_KEY) {
      return new Response(JSON.stringify({ error: "שגיאת התחברות — בדוק את מפתחות ה-API שלך" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!UUID_RE.test(VAPI_PHONE_NUMBER_ID)) {
      return new Response(JSON.stringify({ error: "VAPI_PHONE_NUMBER_ID לא תקין (חייב UUID)" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "לא מאומת" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const {
      phone_number, lead_id, listing_id, voice_id: bodyVoiceId,
      voice_gender: bodyVoiceGender, user_gender: bodyUserGender,
      instructions: brokerInstructionsRaw,
    } = body as {
      phone_number?: string; lead_id?: string; listing_id?: string;
      voice_id?: string; voice_gender?: string | null; user_gender?: string | null;
      instructions?: string | null;
    };
    const brokerInstructions = (brokerInstructionsRaw || '').toString().trim() || null;
    const voiceGender = bodyVoiceGender === 'male' || bodyVoiceGender === 'female' ? bodyVoiceGender : null;
    let userGender = bodyUserGender === 'male' || bodyUserGender === 'female' ? bodyUserGender : null;
    // Fallback: look up the caller's gender from profiles if the client didn't pass it.
    if (!userGender) {
      const { data: p } = await supabase.from('profiles').select('gender').eq('id', user.id).maybeSingle();
      if (p?.gender === 'male' || p?.gender === 'female') userGender = p.gender;
    }

    if (!phone_number) {
      return new Response(JSON.stringify({ error: "חסר מספר טלפון" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const customerNumber = normalizeE164(phone_number);
    if (!/^\+[1-9]\d{7,14}$/.test(customerNumber)) {
      return new Response(JSON.stringify({ error: "מספר לא תואם E.164" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pull lead context
    let leadName = "", city = "", preferences = "";
    if (lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("full_name, city, preferences")
        .eq("id", lead_id)
        .maybeSingle();
      leadName = (lead?.full_name || "").toString().trim();
      city = (lead?.city || "").toString().trim();
      preferences = lead?.preferences ? JSON.stringify(lead.preferences).slice(0, 600) : "";
    }

    // Pull either a specific listing (IVR context) or a short top-listings blurb
    let listingsBlurb = "";
    let focusListing = "";
    let researchIntel = "";
    try {
      if (listing_id) {
        const { data: l } = await supabase
          .from("listings")
          .select("property_title, description, features, city, neighborhood, address, asking_price")
          .eq("id", listing_id)
          .maybeSingle();
        if (l) {
          focusListing = [
            `נכס מוקד השיחה: ${l.property_title ?? ""} ב${l.city ?? ""}`,
            l.asking_price ? `מחיר מבוקש: ₪${l.asking_price}` : "",
            l.description ? `תיאור: ${String(l.description).slice(0, 500)}` : "",
            l.features ? `מאפיינים: ${JSON.stringify(l.features).slice(0, 400)}` : "",
            "אם הלקוח מעלה התנגדות (למשל 'אין מעלית'), השב במסגרת ה-Playbook של מתווך בכיר: הכר בהתנגדות, מסגר מחדש את היתרון, וחזור לשאלת איתור צרכים.",
          ].filter(Boolean).join("\n");
          // Inject owner-curated research/file intelligence for this listing's
          // city/neighborhood so the voice agent quotes real schools/prices/
          // transit instead of generic talking points.
          try {
            const { fetchResearchIntelBlock } = await import("../_shared/research-intel.ts");
            researchIntel = await fetchResearchIntelBlock(user.id, [
              l.city, l.neighborhood, l.address, l.property_title,
            ]);
          } catch (e) {
            console.warn("vapi research intel non-fatal failure:", e instanceof Error ? e.message : e);
          }
        }
      } else {
        const { data: listings } = await supabase
          .from("listings")
          .select("property_title, city, asking_price")
          .eq("status", "live")
          .order("created_at", { ascending: false })
          .limit(5);
        listingsBlurb = (listings ?? [])
          .map((l: any) => `• ${l.property_title ?? ""} (${l.city ?? ""}) - ₪${l.asking_price ?? "?"}`)
          .join("\n");
      }
    } catch (_) { /* best effort */ }

    const baseSystemPrompt = buildSystemPrompt({
      leadName, city, preferences,
      listingsBlurb: focusListing || listingsBlurb,
      voiceGender, userGender, brokerInstructions,
    });
    const systemPrompt = [researchIntel, baseSystemPrompt].filter(Boolean).join("\n\n");
    const firstMessage = leadName
      ? `שלום ${leadName}, מדבר הסוכן הדיגיטלי של המתווך. יש לי שתי שאלות קצרות לגבי החיפוש שלך, אפשר?`
      : "שלום, מדבר הסוכן הדיגיטלי של המתווך. יש לי שתי שאלות קצרות לגבי החיפוש שלך, אפשר?";

    const toolsServerUrl = `${SUPABASE_URL}/functions/v1/vapi-tool-handler`;
    const assistant = buildAssistant({
      systemPrompt,
      firstMessage,
      // Prefer the voice the broker picked in the dialog; fall back to env default.
      voiceId: bodyVoiceId || ELEVENLABS_VOICE_ID,
      toolsServerUrl,

      leadId: lead_id ?? null,
      userId: user.id,
    });
    // Strip helper-only field before sending.
    delete (assistant as any)._hdr;

    // CLEAN PAYLOAD — only fields Vapi accepts on /call/phone.
    const payload = {
      phoneNumberId: VAPI_PHONE_NUMBER_ID,
      customer: { number: customerNumber },
      assistant,
    };

    const payloadJson = JSON.stringify(payload);
    console.log("[VAPI] sending payload bytes =", payloadJson.length);
    const vapiRes = await fetch("https://api.vapi.ai/call/phone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: payloadJson,
    });
    const text = await vapiRes.text();
    if (!vapiRes.ok) {
      console.error("[VAPI] non-2xx", vapiRes.status, text);
      return new Response(JSON.stringify({
        error: "Vapi דחה את הבקשה",
        vapi_status: vapiRes.status,
        vapi_body: text,
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let parsed: any = text; try { parsed = JSON.parse(text); } catch (_) {}
    return new Response(JSON.stringify({ success: true, call: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[VAPI] fatal", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
