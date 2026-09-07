import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  adminClient,
  loadKbSnippets,
  loadKbInstructions,
  loadKbPostTemplates,
  loadCrmSnapshot,
  renderKbBlock,
  renderKbInstructionsBlock,
  renderKbTemplatesBlock,
  renderCrmBlock,
  ANTI_SPAM_RULES,
  CTA_RULE,
} from "../_shared/grounding.ts";
import { fetchLearnedOverridesBlock } from "../_shared/persona.ts";
import { fetchWorkspacePersona, renderPersonaBlock } from "../_shared/workspacePersona.ts";
import { enforceOwnerLaws, fetchOwnerBranding } from "../_shared/owner-laws.ts";
import { enforceSingleEmojis, RICH_TEMPLATE_CONTRACT } from "../_shared/emoji.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function stripAddressNumbers(value: unknown): string {
  let s = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!s) return s;
  s = s.replace(/(?:דירה|דירת|ד['׳"]|כניסה|בית|מספר)\s*\d+[א-ת]?\b/g, "");
  const unit = /(?:חדרים|חדר|מ["׳']?\s*ר|מטר|קומה|קומות|דקות|שעות|שנה|שנים|אחוז|%|₪|ש["׳']?\s*ח|דולר|\$|€)/;
  const wordDigit = /(^|[^\d:=״"׳'])([\u0590-\u05FF]{2,}(?:[\u0590-\u05FF״"׳'-]*[\u0590-\u05FF])?)\s+(\d{1,4})[א-ת]?(?=\s|,|$)/;
  for (let i = 0; i < 6; i++) {
    const next = s.replace(wordDigit, (m, pre, word, _num, offset, full) => {
      const after = String(full).slice(offset + m.length, offset + m.length + 24);
      if (unit.test(after.trim())) return m;
      if (/^(שנת|שנה|גיל|טלפון|נייד|מספר|דירה|קומה|בנין|בניין|פרויקט|פרוייקט|בן|בת)$/.test(word)) return m;
      return `${pre}${word}`;
    });
    if (next === s) break;
    s = next;
  }
  return s.replace(/\s+,/g, ",").replace(/[ \t]{2,}/g, " ").replace(/[,\s]+$/g, "").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { topic, platform, customInstructions, selectedListingId, listingFocusOnly, skipLicenseFooter } = await req.json();
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
    const [kb, kbInstructions, kbTemplates, snap] = await Promise.all([
      loadKbSnippets(admin, userId),
      loadKbInstructions(admin, userId),
      loadKbPostTemplates(admin, userId),
      loadCrmSnapshot(admin, userId),
    ]);
    const kbInstructionsBlock = renderKbInstructionsBlock(kbInstructions);
    const kbTemplatesBlock = renderKbTemplatesBlock(kbTemplates);
    const hasKbTemplate = kbTemplates.length > 0;


    const featureLabels = (features: unknown) => Array.isArray(features)
      ? features
          .map((feature) => typeof feature === "string"
            ? feature
            : feature && typeof feature === "object" && "label" in feature
              ? String((feature as Record<string, unknown>).label ?? "")
              : "")
          .filter(Boolean)
      : [];
    const listingTypeFromFeatures = (features: unknown) => Array.isArray(features)
      ? ((features.find((feature) => feature && typeof feature === "object" && "listing_type" in feature) as Record<string, unknown> | undefined)?.listing_type)
      : null;

    // Fetch a specific promoted listing when supplied by the UI.
    let promotedListing: any = null;
    if (selectedListingId && userId) {
      try {
        const { data: row } = await admin
          .from("listings")
          .select("*")
          .eq("id", selectedListingId)
          .maybeSingle();
        if (row) promotedListing = row;
      } catch { /* non-fatal */ }
    }

    const platformRules: Record<string, string> = {
      instagram: "3-4 משפטים חדים. פתח בהוק קונקרטי על נכס/אזור מתוך ההקשר. בלי האשטגים, בלי תגיות, בלי מילות מפתח.",
      facebook: "3-5 משפטים. פתיחה ספציפית מתוך הנתונים החיים. שפה מקצועית-נגישה.",
      twitter: "מקסימום 280 תווים. ישיר, ממוקד, בלי הקדמות.",
      x: "מקסימום 280 תווים. ישיר, ממוקד, בלי הקדמות.",
      whatsapp: "קצר, ישיר, סגנון מתווך-ללקוח שנשלח מהטלפון.",
      linkedin: "5-7 משפטים בטון יועץ בכיר. תובנה אחת + CTA אחד.",
    };
    const rule = platformRules[String(platform).toLowerCase()] || "קצר, חד, מקצועי.";

    const entropySeed = `${crypto.randomUUID()}-${Date.now()}`;

    // Broker identity comes from THIS workspace only. Never hardcode a broker.
    const ownerBranding = await fetchOwnerBranding(admin as any, userId);
    const brokerName = ownerBranding.name || "המתווך";
    const brokerFirst = brokerName.split(/\s+/)[0];

    const wsPersona = await fetchWorkspacePersona(admin as any, userId);
    const isSaas = wsPersona.domain === "software";
    // A software / SaaS workspace never markets a property listing.
    if (isSaas) promotedListing = null;


    const BROKER_PERSONA = isSaas
      ? `${renderPersonaBlock(wsPersona)}

You write the workspace's own marketing posts, aimed at real-estate agents and agencies who could become customers of the software. You are NOT a broker and you never market apartments, listings or property prices. Every claim about features, pricing or results must come from the workspace knowledge base. The goal of every post is to get the reader to book a short (about 15 minute) Zoom demo.`
      : `${renderPersonaBlock(wsPersona)}

PERSONA (LOCKED — NEVER BREAK CHARACTER):
You are ${brokerName} — a senior Israeli real-estate broker writing personally from your own phone.
You sell and rent your clients' properties using deep local intelligence and direct relationships.
You write as a senior advisor closing deals, never as a software, assistant, bot, platform, or tool.`;

    const FORBIDDEN_WORDS = isSaas
      ? `FORBIDDEN: presenting yourself as a real-estate broker, marketing a specific apartment/property, inventing prices, plans, features or client results that are not in the workspace knowledge base.`
      : `ABSOLUTE FORBIDDEN VOCABULARY (zero tolerance — if any of these appear, the output is rejected):
- "Realtyz", "רילטיז", "Realtyz AI"
- "AI", "בינה מלאכותית", "בוט", "צ'אטבוט", "אלגוריתם", "Algorithm"
- "Platform", "פלטפורמה", "מערכת", "כלי תוכנה", "תוכנה", "אפליקציה", "אוטומציה"
- "as an AI", "I am an AI", "automated message", "generated by"
Never reference any software, vendor, brand, or tool. You are the broker, period. Promote ONLY ${brokerFirst}'s brokerage services, achievements, and the real properties from the database/KB.`;

    const customBlock = customInstructions && String(customInstructions).trim()
      ? `[BROKER'S CUSTOM INSTRUCTIONS FOR THIS POST] (highest priority — obey verbatim):\n"""${String(customInstructions).trim().slice(0, 1500)}"""`
      : "";

    const promotedFeatures = promotedListing ? featureLabels(promotedListing.features) : [];
    const publicListingAddress = promotedListing?.address ? stripAddressNumbers(promotedListing.address) : null;
    const promotedListingType = promotedListing ? listingTypeFromFeatures(promotedListing.features) : null;
    // Area-perks / neighborhood enrichment intentionally NOT used in posts.
    // Posts stay focused on the property's own selling/renting features.


    const dealTypeLabel = (() => {
      const dt = String(promotedListing?.deal_type || promotedListingType || "").toLowerCase();
      if (dt === "rent" || dt === "השכרה") return "להשכרה";
      if (dt === "sale" || dt === "מכירה") return "למכירה";
      return null;
    })();
    // Market research / comparable-sales statistics intentionally removed —
    // posts must stay on the property's own selling/renting story.


    const propertyTypeLabel = (() => {
      const sm = promotedListing?.source_metadata;
      if (sm && typeof sm === "object") {
        const t = (sm as any).property_type || (sm as any).propertyType || (sm as any).type;
        if (t) return String(t).trim();
      }
      return null;
    })();
    const promotedBlock = promotedListing
      ? [
          "[PROMOTED LISTING — THIS POST MUST PROMOTE THIS EXACT PROPERTY] (use ONLY these real fields — never alter prices, address, rooms, or features):",
          promotedListing.property_title ? `כותרת הנכס: ${promotedListing.property_title}` : null,
          propertyTypeLabel ? `סוג נכס: ${propertyTypeLabel}` : null,
          dealTypeLabel ? `סוג עסקה: ${dealTypeLabel}` : null,
          publicListingAddress ? `כתובת (רחוב בלבד, בלי מספר בית): ${publicListingAddress}` : null,
          promotedListing.neighborhood ? `שכונה: ${promotedListing.neighborhood}` : null,
          promotedListing.city ? `עיר: ${promotedListing.city}` : null,
          promotedListing.rooms ? `חדרים: ${promotedListing.rooms}` : null,
          promotedListing.sqm ? `שטח: ${promotedListing.sqm} מ"ר` : null,
          promotedListing.floor ? `קומה: ${promotedListing.floor}` : null,
          promotedListing.asking_price ? `מחיר מבוקש: ${Number(promotedListing.asking_price).toLocaleString("he-IL")} ש"ח` : null,
          promotedListing.parking ? `חניה: כן` : null,
          promotedListing.elevator ? `מעלית: כן` : null,
          promotedFeatures.length
            ? `מאפיינים בולטים: ${promotedFeatures.slice(0, 8).join(", ")}`
            : null,
          // NOTE: The full free-text description is INTENTIONALLY excluded from the main post prompt.
          // It belongs in the FIRST COMMENT box (handled client-side), not in the main post body.


        ].filter(Boolean).join("\n")
      : "";

    const focusOnly = !!listingFocusOnly && !!promotedListing;

    const FOCUS_ONLY_RULE = focusOnly ? `
LISTING-FOCUS MODE — EXACT MASTER TEMPLATE (mandatory, no deviation, blank line between blocks):
1. Opener hook (MANDATORY COMPOSITION — one short punchy line, MUST include ALL of the following when available):
   • סוג עסקה (למכירה / להשכרה) — חובה.
   • סוג הנכס במפורש (דירה / פנטהאוז / דופלקס / קוטג' / וילה / גג / סטודיו וכו') — חובה, מתוך [PROMOTED LISTING].
   • שם הרחוב (בלי מספר בית) — חובה אם קיים.
   • שם השכונה — חובה אם קיים בנתונים (אחרת דלג לגמרי, אל תמציא).
   • עיר וכמות חדרים — כשקיימים.
   • 1-2 מילות מפתח שיווקיות משכנעות ומדויקות (למשל: "הזדמנות נדירה", "מיקום מנצח", "מוכן לכניסה", "נוף פתוח", "שקט מוחלט") — רק אם הן נאמנות לנתונים.
   פורמט מומלץ (גמיש בטון, אבל חייב לכלול את הפרטים): "🏡 <מילת מפתח משכנעת> — <סוג נכס> <חדרים> חדרים <למכירה/להשכרה> ברחוב <שם רחוב>, שכונת <שכונה>, <עיר>".
   אסור: הצגה עצמית ("אני ${brokerFirst}", "כמתווך", "בתור מתווך"), מספרי בית, שכונה במספר/אות ("שכונה 10", "שכונה ג'"), מילות מפתח שקריות.
2. שורת נתוני ליבה: "📐 <מ"ר בנוי / שטח> | <מספר חדרים> חדרים | קומה <קומה> מתוך <סה"כ קומות>" — כל שדה שקיים ב-[PROMOTED LISTING] חייב להופיע. אין לדלג על מ"ר, חדרים או קומה כשהם קיימים.
3. בלוק פיצ'רים עשיר (חובה — לב הפוסט): 4-8 שורות בולט, כל שורה מתחילה באמוג'י אחד רלוונטי + רווח + הפיצ'ר. חובה למחות ולנצל את *כל* הפיצ'רים, המרפסות, השטחים, החניות, המחסן, המעלית, המיזוג, השיפוץ, הכיווני אוויר, הנוף, הממ"ד, הגישה לנכים והתוספות שקיימים בנתוני הנכס / עמוד המקור. אמוג'ים מותאמים: ✨ פיצ'ר בולט, 🏢 בניין/קומות, 🛗 מעלית, 🚗 חניה, 🌤️ מרפסת/נוף, 🛏️ חדרים, 🧱 מחסן, ❄️ מיזוג, 🛡️ ממ"ד, 🔑 מוכן לכניסה.
4. שורת מיקום: "📍 <שכונה + נגישות, תחבורה, חינוך, מרכזי קניות>" — משפט אחד קצר ומדויק.
5. שורת לייף-סטייל: "💫 <יתרון חיים אמיתי לרוכש>" — משפט אחד.
6. שורת מחיר: "💰 מחיר מבוקש: <מחיר>" (המחיר מילולית מ-[PROMOTED LISTING]).
- אורך מינימלי (HARD): לעולם אל תפיק פוסט קצר או גנרי. פוסט נכס תקין כולל לפחות 8 שורות תוכן, מתוכן לפחות 4 שורות בולט פיצ'רים. פוסט של 2-3 שורות נחשב כשלון.
- חובה למחות מעמוד המקור/הנתונים כל פרט זמין: שטח, שטח מרפסות, חדרים, חדרי שירותים, קומה, סה"כ קומות, מעלית, חניות, מחסן, מיזוג, כיווני אוויר, נוף, מצב הנכס, תאריך כניסה, ועד/ארנונה, ממ"ד, גישה לנכים.
- FORBIDDEN: long broker-intro paragraphs, "אני ${brokerFirst}", "כמתווך", "בתור מתווך", "יש לי הכבוד", "אני שמח להציג", "אני גאה להציג", any self-branding preface, ✅ bullets, keyword pipe-line, hashtags.
- Ground every concrete detail (address, rooms, sqm, floor, price, features) in [PROMOTED LISTING]. Do NOT invent details. פיצ'ר שלא קיים בנתונים — פשוט לא מופיע.
- FORBIDDEN: market statistics, transaction/comparable data, average prices per sqm, "נתוני שוק", "עסקאות אחרונות", neighborhood research or any data not belonging to this listing.

- STREET-NUMBER RULE (HARD): every address token must be street name only, never with house number, apartment number, or entrance number. "רחוב X 12" → "רחוב X". This applies to hook, description, location line, everywhere.
- ABSOLUTELY FORBIDDEN: bracketed placeholders ("[insert license]", "[מספר טלפון]", "[TBD]", "[Real License Number]"), square-bracket tokens, or parenthetical instructions.
- DO NOT write a signature, phone number, license number, byline, WhatsApp line, or contact line yourself. The system appends the broker's own signature block automatically.` : "";




    const EMOJI_RULES = `EMOJI LAW (rich template, exactly one emoji per line):
- כל שורה בפוסט מתחילה באמוג'י אחד רלוונטי בלבד, ואחריו רווח ואז הטקסט.
- פלטת האמוג'ים המותרת: 🏡 ✨ 🏢 🛗 🚗 💰 📍 📐 💫 🌤️ 🛏️ 🧱 ❄️ 🛡️ 🔑 📞. בחר את האמוג'י שמתאים לתוכן השורה.
- HARD RULE: אסור בהחלט שני אמוג'ים זה לצד זה (אסור "🏡✨", "✨🏡", "💫🌇"). אמוג'י אחד לכל שורה, לכל היותר.
- Never stack emojis, never repeat the same emoji twice in the post, never end the post with a string of emojis.
- Do NOT use ✅ bullets or "-"/"•" bullets — האמוג'י הוא הבולט.
- FORBIDDEN everywhere: 💎 🔥 🎉 💯 🌟 ❤️ 💪 👇 🙌 🤩 ⭐ and any hype/spam emoji.`;

    // B2B SaaS workspace prompt — built ONLY from the workspace persona +
    // knowledge base. Zero brokerage/agent/licence content.
    // Every regeneration picks a different hook/angle so the copy never repeats.
    const SAAS_ANGLES = [
      'ANGLE: סיפור מהשטח — פותחים בתמונת מצב של סוכן שרץ כל היום בין שיחות ומפספס פנייה חמה, ומשם לפתרון.',
      'ANGLE: אתגר ישיר — פותחים בשאלה חדה שמאלצת את הסוכן להודות שהוא עובד קשה מדי על מעקב ידני.',
      'ANGLE: בעיה-פתרון — מציגים בדיוק את הצוואר בקבוק (וואטסאפ מפוזר, לידים ללא מענה) ואז את האוטומציה שמסירה אותו.',
      'ANGLE: מכת מציאות / נתון — פותחים באמת לא נוחה על מהירות תגובה ולידים שנשרפים, ומראים מה קורה כשהמערכת עונה במקומך.',
      'ANGLE: לפני ואחרי — יום בחיי סוכן בלי המערכת מול יום עם המערכת, בלי לגלוש להתלהבות ריקה.',
      'ANGLE: עלות ההזדמנות — כמה עסקאות נשארות על הרצפה בגלל מעקב שלא קרה, ואיך זה נסגר מעכשיו.',
      'ANGLE: מיתוס — מפרקים אמונה נפוצה ("צריך לענות לכולם בעצמי כדי לשמור על יחס אישי") ומראים למה זו בדיוק המלכודת.',
      'ANGLE: התנגדות ראשונה — עונים מראש להתנגדות אמיתית מתוך מאגר הידע, בלי להמציא מחיר או הבטחה.',
    ];
    const saasAngle = SAAS_ANGLES[Math.floor(Math.random() * SAAS_ANGLES.length)];

    const saasSystemPrompt = `${renderPersonaBlock(wsPersona)}

ROLE (LOCKED): You are the B2B software sales & marketing voice of this workspace's SaaS platform for real-estate agencies and agents. You are NOT a real-estate agent, you have no brokerage licence, you never sell or market apartments, plots, listings, prices or viewings, and you never write in the voice of a broker.

פלטפורמה: ${platform}
כללי פלטפורמה: ${rule}

הקהל: סוכני ומשרדי נדל"ן בישראל. מדברים אליהם ישירות בגוף שני ("אתה", "אתם"), בלי הקדמות, בלי "אנחנו שמחים להציג".

COPYWRITING (חובה):
- פותחים ישר בכאב שלהם, בשורה הראשונה: הריצה הידנית והמתישה, ליד חם שנפל בין הכיסאות, שעות שנשרפות בשיחות וואטסאפ, מעקב שלא קרה, עסקה שהתפספסה בגלל תגובה מאוחרת.
- מחדדים את המחיר של הכאב: זמן, כסף, עסקאות, שחיקה.
- ואז מפנים לפתרון: המערכת מריצה את השיווק, הפרסום והמעקב על אוטופילוט, עונה ללידים בעצמה, ומחזירה לסוכן את כל הזמן כדי שיתעסק רק בסגירת עסקאות.
- טון: אגרסיבי כלפי הבעיה, אנושי כלפי הסוכן, בלי בלה-בלה, בלי מילות מילוי, כל שורה מרוויחה את מקומה.
- כל פוסט מסתיים ב-CTA חד לתיאום שיחת זום של 15 דקות (הדגמה), מנוסח אחרת בכל פעם.

${saasAngle}
VARIETY RULE (HARD): כל יצירה מחדש חייבת להיות טקסט חדש לחלוטין — הוק אחר, מבנה אחר, סגנון קופי אחר וניסוח CTA אחר. אסור לחזור על אותה פתיחה, אותה מטאפורה או אותה תבנית.

EMOJI & LAYOUT (HARD):
- אמוג'י אחד בלבד בתחילת שורות מפתח, כבולט.
- CRITICAL: אסור בשום מצב יותר מאמוג'י אחד באותה שורה. אסור שני אמוג'ים צמודים, אסור אמוג'י בסוף שורה, אסור רצף אמוג'ים בסוף הפוסט.
- לא כל שורה חייבת אמוג'י. שומרים על מבנה נקי, חד ומקצועי, שורה ריקה בין בלוקים.
- אסור בולטים של "-", "•", "✅" או כוכביות. אסור 🔥 💎 💯 🌟 🎉 👇 🙌.

GROUNDING POLICY (אפס סובלנות לפיברוק):
- כל פיצ'ר, מחיר, חבילה, תנאי, אחוז שיפור, מספר לקוחות או תוצאה חייבים להופיע מילולית ב-[WORKSPACE KNOWLEDGE BASE]. אם משהו לא נמצא שם — אל תכתוב אותו.
- מדרגות המחירים והמסרים נלקחים מהמאגר בלבד. אין להמציא מחיר, מסלול, הנחה או התחייבות.
- אין להשתמש בנתוני לקוחות, לידים או שיחות פרטיות בפוסט.

ABSOLUTE FORBIDDEN (הפרה = פסילה):
- להציג את עצמך כמתווך, סוכן נדל"ן, בעל רישיון או משרד תיווך.
- "רישיון תיווך", מספר רישיון, חתימת מתווך, "שנות ניסיוני בזירה המקצועית", "כמתווך", ניסיון במכירת דירות, סיפורי עסקאות אישיות.
- לשווק דירה, נכס, כתובת או מחיר נדל"ן.
- סוגריים מרובעים / placeholders ("[מספר טלפון]", "[TBD]"), האשטגים, תגיות או שורת מילות מפתח.
- em-dash (—), en-dash (–), "--", "---".

כתוב בעברית ישראלית טבעית, ישירה ומשכנעת, 5-9 שורות. החזר את הפוסט בלבד, בלי הסברים.`;

    const brokerSystemPrompt = `${BROKER_PERSONA}


פלטפורמה: ${platform}
כללי פלטפורמה: ${rule}

${FORBIDDEN_WORDS}
${EMOJI_RULES}
${FOCUS_ONLY_RULE}


GROUNDING POLICY (אפס סובלנות לפיברוק):
- אסור להמציא נכסים, ערים, מחירים, פיצ'רים או נתונים שלא מופיעים במפורש ב-[PROMOTED LISTING] / [LIVE PROPERTIES & CRM CONTEXT] / [WORKSPACE KNOWLEDGE BASE].
- אם יש [PROMOTED LISTING] — הפוסט חייב למקד אותו בלבד עם הפרטים המדויקים מהשורה.
- אם אין נכס ספציפי, דבר מעמדה של מומחיות אישית של ${brokerFirst} (תובנת שוק, ניסיון מהשטח) — בלי להמציא נכס פיקטיבי.
- כל ציטוט של רחוב / עיר / מחיר חייב להופיע מילולית במאגר שלמעלה.

NEIGHBORHOOD-NAMING RULE (HARD):
- לעולם אל תזהה שכונה במספר או בספרות (אסור "שכונה 10", "שכונה ג'", "אזור 7").
- אם יש שם שכונה בעברית בנתונים — השתמש בו בלבד (לדוגמה: "הרצליה הירוקה", "נווה עמל").
- אם אין שם שכונה אמיתי — דלג לחלוטין על שורת השכונה. אל תכתוב "שכונת [שכונה]" ואל תמציא שם.


${ANTI_SPAM_RULES}

${CTA_RULE}
- ה-CTA תמיד מזמין פנייה ישירה ל${brokerFirst} ב-WhatsApp או Messenger (או טלפון למשרד) — מנוסח אחרת בכל פוסט, בלי לציין שום כלי תוכנה.

NO-HASHTAGS RULE (HARD — ZERO TOLERANCE):
- אסור להוסיף שום האשטגים, תגיות, מילות מפתח או טוקנים שמתחילים ב-"#" בסוף הפוסט או בתוכו.
- אסור לכתוב שורת tags/keywords/האשטגים/תגיות גם בעברית וגם באנגלית, בלי תלות בתבנית.
- הפוסט מסתיים בחתימה של ${brokerFirst} בלבד.

איסור מוחלט: פוליטיקה, מפלגות ובחירות.

HIGH-CONVERTING COPY STRUCTURE (apply ONLY when a specific נכס/PROMOTED LISTING exists — EXACT MASTER TEMPLATE):
- מבנה חובה (שורה ריקה בין בלוקים): (1) 🏡 הוק כותרת: סוג עסקה + סוג הנכס + חדרים + שם הרחוב (בלי מספר בית) + שכונה + עיר + 1-2 מילות מפתח מדויקות  (2) 📐 שורת נתוני ליבה: מ"ר | חדרים | קומה מתוך סה"כ  (3) בלוק פיצ'רים עשיר של 4-8 שורות בולט (אמוג'י אחד לכל שורה) שממחה *כל* פיצ'ר, מרפסת, חניה, מחסן, מעלית, מיזוג, כיווני אוויר, נוף, ממ"ד ותוספת שקיימים בנתונים/עמוד המקור  (4) 📍 שורת מיקום ונגישות  (5) 💫 שורת לייף-סטייל  (6) 💰 מחיר מבוקש.
- לעולם אל תפיק פוסט קצר או גנרי: מינימום 8 שורות תוכן, מתוכן לפחות 4 שורות פיצ'רים. פוסט של 2-3 שורות = כשלון.
- Human, punchy, convincing, no filler, no walls of text, no ✅ bullets, no "-"/"•" bullets, no keyword pipe-line, no hashtags. האמוג'י הוא הבולט, אמוג'י אחד לכל שורה ואסור שני אמוג'ים צמודים.
- אסור בהחלט לפתוח את הפוסט בהצגה עצמית של ${brokerFirst} כמתווך ("אני ${brokerFirst}", "כמתווך", "בתור מתווך", "יש לי הכבוד", "אני גאה להציג", "אני שמח להציג"). נכנסים ישר לנכס.
- Every concrete detail (רחוב, שכונה, חדרים, מ"ר, קומה, מחיר, פיצ'רים) חייב להישלף מ-[PROMOTED LISTING] בלבד. אל תמציא.
- כלל כתובת קשיח: לעולם אל תכלול מספר בית / דירה / כניסה בכתובת. השתמש בשם הרחוב בלבד (למשל "אריה לייב יפה", לא "אריה לייב יפה 36 2").
- אסור בהחלט: סוגריים מרובעים ריקים/הוראות ("[insert license]", "[מספר טלפון]", "[TBD]", "[Real Phone Number]"), טקסט הוראה בסוגריים, או כל טוקן placeholder. כל ערך חייב להיות אמיתי או להיות מושמט לחלוטין.
- אל תכתוב בעצמך חתימה/טלפון/רישיון/WhatsApp/byline — המערכת מוסיפה אוטומטית את בלוק החתימה של ${brokerFirst} בסוף הפוסט.


כתוב בעברית בלבד, ישראלית טבעית, בגוף ראשון של ${brokerFirst}. החזר את הפוסט בלבד, בלי הסברים נלווים.`;

    const systemPrompt = isSaas ? saasSystemPrompt : brokerSystemPrompt;

    const noListingSelected = !promotedListing;

    const GENERAL_POST_RULE = (!isSaas && noListingSelected) ? `
GENERAL POST MODE (HARD OVERRIDE — highest priority, PRIVACY-CRITICAL):
- No specific property was selected. Write a GENERAL post about ${brokerFirst} as a broker: his approach, motivation, professional insights, market perspective, values, success mindset, or general activity in the field.
- ABSOLUTELY FORBIDDEN: any client name, lead name, owner name, phone number, email, address of a private deal, specific property from the CRM, private notes, internal reminders, deal status, negotiation details, or anything sourced from CRM/leads/messages/private KB entries.
- Do NOT reference "a client I spoke with", "a lead who called", "a request I received", "an owner who...", or any anecdote tied to a real person in the workspace.
- Do NOT quote or paraphrase private notes, meeting summaries, WhatsApp chats, or internal reminders.
- Write in first person as ${brokerFirst} about broker craft, motivation, discipline, work ethic, market observations at a generic level, or goals — nothing that exposes private CRM data.
` : "";

    const SAAS_POST_RULE = isSaas ? `
SAAS MARKETING POST MODE (HARD OVERRIDE — highest priority):
- Everything factual (features, pricing tiers, terms, proof points) must appear verbatim in [WORKSPACE KNOWLEDGE BASE]. Nothing else is allowed.
- Never write as a real-estate agent and never mention a brokerage licence, licence number, agent signature, years of brokerage experience, or any apartment/property being sold.
- Never expose private CRM data, client names, lead names or phone numbers.
- Close with a clear invitation to book a ~15 minute Zoom demo, phrased differently every time.
- Open on the agent's raw pain in the FIRST line (manual grind, hot leads slipping through the cracks, hours lost in WhatsApp threads, deals missed on slow follow-up), then pivot to the software running marketing and follow-ups on autopilot so they only close deals.
- Speak directly to the agent in second person. Aggressive about the bottleneck, never hypey, no filler.
- ${saasAngle}
- At most ONE emoji per line, used as a leading bullet on key lines. Two emojis on the same line = rejected.
- Every regeneration must use a different hook, structure and CTA wording than any previous post.
` : "";

    // Universal readability + compliance layout law (all workspaces).
    const LAYOUT_RULE = `
LAYOUT LAW (mandatory):
- No long dense paragraphs. Short, punchy sentences, one idea per line.
- Every line is separated from the next by a FULL BLANK LINE (double line break). Lines must never bunch up.
- Short punch lines start with a single emoji as a bullet. Never more than one emoji per line.
- NEVER put a WhatsApp link, wa.me URL, api.whatsapp.com link, phone number CTA or any URL inside the post body. The contact link lives ONLY in the automatic first comment.
- NEVER write a real-estate licence field or placeholder ("רישיון תיווך מספר:", "מספר רישיון", licence footer). Omit it completely.
`;

    const userPrompt = [
      kbTemplatesBlock || null,
      promotedBlock,
      // Never expose CRM/private client data in general (no-listing) posts.
      isSaas || focusOnly || noListingSelected ? null : renderCrmBlock(snap),
      isSaas ? renderKbBlock(kb) : (focusOnly || noListingSelected ? null : renderKbBlock(kb)),
      kbInstructionsBlock || null,
      customBlock,
      GENERAL_POST_RULE || null,
      SAAS_POST_RULE || null,
      LAYOUT_RULE,
      isSaas
        ? `נושא הפוסט (כיוון כללי מהמשתמש): ${topic}\n\nכתוב פוסט שיווקי B2B בשם הפלטפורמה: כאב תפעולי אמיתי של סוכן/סוכנות נדל"ן, איך התוכנה פותרת אותו (חיסכון בזמן, אוטומציה, CRM, מענה AI ללידים), וסיום בהזמנה לזום של 15 דקות. רק מסרים, פיצ'רים ומחירים שמופיעים במאגר הידע.`
        : focusOnly
          ? `מטרת הפוסט: פוסט מכירה/השכרה קצר וישיר לנכס שלמעלה בלבד — בלי שום הקשר אישי, ביוגרפיה או נושאים לא קשורים.`
          : noListingSelected
            ? `נושא הפוסט (כיוון כללי מהמשתמש): ${topic}\n\nכתוב פוסט כללי בגוף ראשון על ${brokerFirst} כמתווך — גישה, מוטיבציה, ערכים, תובנות שוק כלליות, הצלחה מקצועית. אסור לחלוטין להזכיר שמות לקוחות, לידים, בעלי נכסים, כתובות פרטיות, או כל פרט מה-CRM.`
            : `נושא הפוסט (כיוון כללי מהמשתמש): ${topic}`,
      `Anti-spam entropy seed (vary opener / structure / CTA vs any prior post): ${entropySeed}`,
      isSaas
        ? `Write the SaaS marketing post now — grounded strictly in the workspace knowledge base. No broker persona, no licence line, no property.`
        : focusOnly
          ? `Write a clean, short, scroll-stopping sales post for the ONE listing above. No personal history. No filler.`
          : noListingSelected
            ? `Write ${brokerFirst}'s general broker post now. NEVER reference any private client, lead, owner, address, or CRM data. Speak generically about the craft.`
            : `Write ${brokerFirst}'s post now — grounded strictly in the blocks above.`,
    ].filter(Boolean).join("\n\n");



    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: [
              await (await import("../_shared/system-rules.ts")).fetchSystemRulesBlock(userId, userPrompt),
              // Live web-research and uploaded-document intelligence tied to
              // this post's promoted listing location (city / neighborhood /
              // address / title) — overrides generic guidance with real data.
              await (await import("../_shared/research-intel.ts")).fetchResearchIntelBlock(userId, [
                promotedListing?.city,
                promotedListing?.neighborhood,
                promotedListing?.address,
                promotedListing?.property_title,
              ]),
              systemPrompt,
              // Rich professional property-post template + strict single-emoji law.
              promotedListing ? RICH_TEMPLATE_CONTRACT : "",
              await fetchLearnedOverridesBlock(admin as any, userId),
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
          { role: "user", content: `${userPrompt}\n\n[OWNER STANDING ORDERS] Before you return the post, re-read every ALWAYS / NEVER rule inside #CRITICAL_SYSTEM_PREFERENCES above and silently rewrite your draft until it complies with each one. Do not return text that violates any rule.` },
        ],
        temperature: 1.0,
        top_p: 0.95,
        presence_penalty: 0.7,
        frequency_penalty: 0.85,
        max_tokens: focusOnly ? 700 : 800,
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

    // HARD SCRUB: for a brokerage workspace, vendor/tech vocabulary must never
    // reach the public. A SaaS workspace SELLS the software, so these words are
    // legitimate there and must never be stripped.
    if (!isSaas) {
      const FORBIDDEN_PATTERNS: { re: RegExp; replacement: string }[] = [
        { re: /\brealtyz(?:\s*ai)?\b/gi, replacement: "" },
        { re: /רילטיז(?:\s*AI)?/gi, replacement: "" },
        { re: /\bA\.?I\.?\b/g, replacement: "" },
        { re: /בינה\s+מלאכותית/gi, replacement: "מומחיות" },
        { re: /אלגוריתם[ים]*/gi, replacement: "ניסיון" },
        { re: /\b(platform|algorithm)\b/gi, replacement: "" },
        { re: /פלטפורמ[הת]/gi, replacement: "משרד" },
        { re: /\bבוט\b/gi, replacement: "" },
        { re: /צ['׳]?אטבוט/gi, replacement: "" },
        { re: /אוטומצי[הת]/gi, replacement: "" },
      ];
      for (const { re, replacement } of FORBIDDEN_PATTERNS) {
        content = content.replace(re, replacement);
      }
    }
    // SaaS safety net: strip any brokerage-licence footer the model slipped in.
    if (isSaas) {
      content = content
        .split("\n")
        .filter((line) => !/רישיון\s*תיווך/.test(line))
        .join("\n");
    }
    // HARD layout rule: at most ONE emoji per line, kept as a leading bullet.
    {
      const EMOJI_RE = /(?:\p{Extended_Pictographic}(?:\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?)*)/gu;
      content = content
        .split("\n")
        .map((line) => {
          const found = line.match(EMOJI_RE);
          if (!found || found.length <= 1) return line;
          const first = found[0];
          let seen = false;
          const stripped = line.replace(EMOJI_RE, (m) => {
            if (!seen && m === first) { seen = true; return m; }
            return "";
          });
          return stripped.replace(/[ \t]{2,}/g, " ").trimEnd();
        })
        .join("\n");
    }
    content = content.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();

    // HARD BODY LAWS: no WhatsApp/contact links and no licence fields in the body.
    content = content
      .split("\n")
      .filter((line) => !/(wa\.me|api\.whatsapp\.com|whatsapp:\/\/|whatsapp\s*[:：]\s*https?)/i.test(line))
      .filter((line) => !/רישיון\s*תיווך|מספר\s*רישיון/.test(line))
      .join("\n")
      .replace(/https?:\/\/(?:www\.)?(?:wa\.me|api\.whatsapp\.com)\/\S*/gi, "")
      .replace(/whatsapp:\/\/\S*/gi, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // READABILITY LAW: a full blank line between every content line so bullets
    // and punch lines never bunch up.
    content = content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join("\n\n")
      .trim();


    // NO-HASHTAGS scrub: remove any hashtag tokens and any trailing
    // "tags / keywords / האשטגים / תגיות" lines, regardless of what the
    // model produced or what a KB template suggested.
    content = content
      .split("\n")
      .filter((line) => !/^\s*(?:tags|keywords|hashtags|האשטגים|תגיות|מילות\s*מפתח)\s*[:：-].*/i.test(line))
      .join("\n")
      .replace(/(^|\s)#[^\s#]+/g, "$1")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Neighborhood naming hard rule: never expose numeric/coded neighborhoods.
    // Strip "שכונת [שכונה]" placeholder leftovers and "שכונה 10" / "שכונה ג'" patterns.
    const validNeighborhood = String(promotedListing?.neighborhood ?? "").trim();
    const hasHebrewName = /[\u0590-\u05FF]/.test(validNeighborhood) && !/^\s*\d+\s*$/.test(validNeighborhood);
    content = content
      // "שכונה 10" / "שכונת 7" / "אזור 4" / "שכונת ג'"
      .replace(/(?:שכונ[הת]|אזור)\s+(?:\d+|[א-ת]['׳]?)(?=\s|[,.!?]|$)/g, hasHebrewName ? `שכונת ${validNeighborhood}` : "")
      // unfilled template placeholders like "שכונת [שכונה]"
      .replace(/שכונת\s*\[[^\]]*\]/g, hasHebrewName ? `שכונת ${validNeighborhood}` : "")
      // dangling "| שכונת  |" separators left after removal
      .replace(/\|\s*\|/g, "|")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // HARD COMPLIANCE LAWS — deterministic safety net (street numbers, license footer).
    // The broker license footer (the workspace owner's own byline + license) is
    // appended ONLY when a real property is attached (promotedListing). General /
    // brand / knowledge posts publish without the listing-grade signature block.
    try {
      const branding = await fetchOwnerBranding(admin as any, userId);
      content = enforceOwnerLaws(content, {
        license: branding.license,
        byline: branding.byline,
        name: branding.name,
        phone: branding.phone,
        withLicense: !isSaas && !!promotedListing && !skipLicenseFooter,
      });
    } catch (_e) { /* never block on enforcement failure */ }

    // NOTE: Short-link CTAs are OPT-IN via the composer's "add WhatsApp link"
    // / "add Messenger link" toggles. Do NOT auto-append a branded shortlink
    // to generated content — the user must explicitly choose to include one.
    // Strip any residual auto-injected CTA line from prior versions just in case.
    content = content.replace(/\n*[^\n]*דברו\s+איתנו\s+עכשיו[^\n]*/gu, "").replace(/\s+$/g, "");

    // HARD EMOJI LAW: never two emojis side by side, always one emoji + space.
    content = enforceSingleEmojis(content);



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

// ── Short-link helper ───────────────────────────────────────────────────────
// Reuses an existing short_urls row for this listing if one exists, otherwise
// allocates a fresh slug whose long_url points at the broker's GreenAPI
// WhatsApp chat pre-filled with the listing context.
const SHORTLINK_ALPHA = "abcdefghijkmnpqrstuvwxyz23456789";
function makeShortSlug(len = 8): string {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let s = "";
  for (let i = 0; i < len; i++) s += SHORTLINK_ALPHA[buf[i] % SHORTLINK_ALPHA.length];
  return s;
}
function normalizeIsraeliPhone(raw: string): string {
  let p = (raw || "").replace(/\D/g, "");
  if (p.startsWith("0")) p = "972" + p.slice(1);
  if (!p.startsWith("972") && p.length === 9) p = "972" + p;
  return p;
}
function formatListingPrice(n: number | null | undefined): string {
  if (!n || !isFinite(Number(n))) return "המחיר המבוקש";
  const v = Number(n);
  return `${v.toLocaleString("he-IL")} ₪`;
}
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function stripListingStreet(rawAddress: string, city: string, neighborhood: string): string {
  let street = String(rawAddress ?? "").trim();
  if (street && city) street = street.replace(new RegExp(`,?\\s*${escapeRegExp(city)}\\s*$`), "").trim();
  if (street && neighborhood) street = street.replace(new RegExp(`,?\\s*${escapeRegExp(neighborhood)}\\s*$`), "").trim();
  return street.replace(/\s+\d+[א-ת]?\s*$/, "").trim();
}
function buildListingLocationPhrase(street: string, neighborhood: string, city: string): string {
  if (street && neighborhood) {
    return city
      ? `ברחוב ${street} ב${neighborhood}, ${city}`
      : `ברחוב ${street} ב${neighborhood}`;
  }
  if (street) return city ? `ברחוב ${street}, ${city}` : `ברחוב ${street}`;
  if (neighborhood) return city ? `בשכונת ${neighborhood}, ${city}` : `בשכונת ${neighborhood}`;
  if (city) return `ב${city}`;
  return "בנכס";
}
function buildListingDealTypeToken(listing: any): string {
  const raw = String(listing?.deal_type ?? listing?.status ?? "").toLowerCase();
  const isRental =
    listing?.is_rental === true ||
    raw === "rent" || raw === "rental" || raw === "lease" ||
    raw.includes("rent") || raw.includes("להשכרה");
  return isRental ? "להשכרה" : "למכירה";
}
function buildListingShortlinkLongUrl(listing: any, brokerFirst?: string): { text: string; long_url: string } {
  const city = String(listing.city ?? "").trim();
  const neighborhood = String(listing.neighborhood ?? "").trim();
  const street = stripListingStreet(String(listing.address ?? ""), city, neighborhood);
  const locationPhrase = buildListingLocationPhrase(street, neighborhood, city);
  const dealToken = buildListingDealTypeToken(listing);
  const rooms = listing.rooms ? String(listing.rooms).trim() : "";
  const price = formatListingPrice(listing.asking_price as number | null);
  const greeting = String(brokerFirst ?? "").trim() ? `היי ${String(brokerFirst).trim()}` : "היי";
  const text = `${greeting}, אני פונה אליך לגבי הדירה ${dealToken} שפרסמת ${locationPhrase}. דירת ${rooms} חדרים במחיר ${price}. אשמח לקבל פרטים נוספים.`;
  return {
    text,
    long_url: `https://api.whatsapp.com/send?phone=972537339533&text=${encodeURIComponent(text)}`,
  };
}
async function ensureListingShortlink(
  admin: any,
  listing: any,
  userId: string,
): Promise<string | null> {
  const { long_url } = buildListingShortlinkLongUrl(listing);

  // 1) Reuse existing slug for this property if present, while force-refreshing
  // the database row so old 7K/generic fallback URLs can never survive.
  const { data: existing } = await admin
    .from("short_urls")
    .select("slug")
    .eq("property_id", listing.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.slug) {
    await admin.from("short_urls").update({ long_url }).eq("slug", existing.slug);
    return existing.slug as string;
  }

  for (let i = 0; i < 5; i++) {
    const slug = makeShortSlug();
    const { error } = await admin
      .from("short_urls")
      .insert({ slug, property_id: listing.id, long_url, created_by: userId });
    if (!error) return slug;
  }
  return null;
}

