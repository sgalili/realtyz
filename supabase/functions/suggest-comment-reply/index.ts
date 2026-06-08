// Realtyz suggest-comment-reply — generates a single AI draft reply to a
// public social comment in the SAME language as the inbound text. Grounded in
// workspace KB + live CRM/listings snapshot, locked to the Udi Vitman persona,
// with anti-spam high-entropy phrasing. Pure compose-and-return.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sanitizeOutboundText, detectDominantLanguage } from "../_shared/ayrshare-helpers.ts";
import {
  adminClient,
  loadKbSnippets,
  loadCrmSnapshot,
  renderKbBlock,
  renderCrmBlock,
  extractListingTypeFromFeatures,
  resolveListingType,
  isListingAllowedForType,
  UDI_PERSONA,
  ANTI_SPAM_RULES,
  CTA_RULE,
  type ListingType,
} from "../_shared/grounding.ts";
import { fetchLearnedOverridesBlock } from "../_shared/persona.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const MILLION_PRICE_RE = /(^|[^\d])\d{1,3}[,.]?\d{3}[,.]?\d{3}([^\d]|$)|מיליון|מליון/i;
const STALE_DELETED_PROPERTY_RE = /(פורצי\s*הדרך|אבן\s*גבירול|רכיבה)/i;
const SALE_LEAK_RE = /(למכירה|מחיר מבוקש|משכנתא|רכישה|לקנות|for sale|asking price|mortgage|purchase)/i;
const RENT_SIGNAL_RE = /(להשכרה|שכירות|לשכור|להשכיר|שכר דירה|שכ"?ד|דמי שכירות|\brent(al|s)?\b|\bfor rent\b|\blease\b|\bto let\b)/i;
const SALE_SIGNAL_RE = /(למכירה|לרכישה|לקנות|נמכרת|רכישה|\bfor sale\b|\bbuy(ing)?\b|\bpurchase\b|\bmortgage\b|משכנתא)/i;
const RENTAL_DELETION_OVERRIDE = `CRITICAL WARNING: The property 'פורצי הדרך 36' is DELETED and does not exist. You are strictly forbidden from writing the words 'פורצי הדרך', 'אבן גבירול', 'רכיבה', or 'למכירה' in this turn. The current session context is 100% RENTAL ONLY (להשכרה). If you mention sales or millions, the application will crash.`;

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function overlapsListingText(haystack: string, listing: Record<string, unknown>): boolean {
  const h = normalizeText(haystack);
  if (!h) return false;
  const candidates = [listing.property_title, listing.address, listing.neighborhood, listing.city]
    .map(normalizeText)
    .filter((v) => v.length >= 4);
  return candidates.some((v) => h.includes(v));
}

function isolateSnapshotForPrompt(snap: any, primaryType: ListingType | null, primaryPrice: number | null) {
  if (!snap || !primaryType) return snap;
  const min = primaryPrice ? primaryPrice * 0.85 : null;
  const max = primaryPrice ? primaryPrice * 1.15 : null;
  const sample_listings = (snap.sample_listings ?? []).filter((listing: any) => {
    const price = Number(listing?.asking_price ?? 0);
    const title = String(listing?.title ?? "");
    if (listing?.listing_type !== primaryType) return false;
    if (primaryType === "rent") {
      if (Number.isFinite(price) && price > 50_000) return false;
      if (SALE_LEAK_RE.test(title)) return false;
    }
    if (min !== null && Number.isFinite(price) && price > 0 && (price < min || price > max)) return false;
    return true;
  });
  return { ...snap, sample_listings, total_listings: sample_listings.length };
}

function hasStaleSaleContext(text: string): boolean {
  return STALE_DELETED_PROPERTY_RE.test(text) || MILLION_PRICE_RE.test(text) || SALE_LEAK_RE.test(text);
}

function scrubRentalCampaignContext(text: string): string {
  if (!text) return "";
  const scrubbed = text
    .replace(/[^\n.!?]{0,80}(?:פורצי\s*הדרך|אבן\s*גבירול)[^\n.!?]{0,180}/gi, "")
    .replace(/[^\n.!?]{0,60}(?:למכירה|מחיר מבוקש|משכנתא|רכישה|לקנות|for sale|asking price|mortgage|purchase)[^\n.!?]{0,140}/gi, "")
    .replace(MILLION_PRICE_RE, "")
    .replace(/רכיבה/gi, "")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !STALE_DELETED_PROPERTY_RE.test(line) && !MILLION_PRICE_RE.test(line))
    .join("\n")
    .trim();
  return scrubbed || "[campaign post context omitted: stale sale wording detected; use LIVE PROPERTIES & CRM CONTEXT only]";
}

function forceSingleRentalSnapshot(snap: any, primaryListing: any) {
  const sample = primaryListing
    ? [{
        title: primaryListing.title,
        city: primaryListing.city ?? null,
        rooms: primaryListing.rooms ?? null,
        sqm: primaryListing.sqm ?? null,
        asking_price: primaryListing.asking_price ?? null,
        listing_type: "rent" as ListingType,
      }]
    : [];
  return {
    ...(snap ?? {}),
    total_listings: sample.length,
    cities: primaryListing?.city ? [{ city: primaryListing.city, count: 1 }] : [],
    sample_listings: sample,
    active_leads: snap?.active_leads ?? 0,
    hot_leads: snap?.hot_leads ?? 0,
    listing_type_filter: "rent" as ListingType,
  };
}

function scrubKbForTransaction(kb: string, primaryType: ListingType | null): string {
  if (!kb || primaryType !== "rent") return kb;
  return kb
    .split(/\n---\n/g)
    .filter((chunk) => !hasStaleSaleContext(chunk))
    .join("\n---\n");
}

function hasRentalSaleLeak(text: string): boolean {
  return hasStaleSaleContext(text);
}

function renderStrictListingPayload(snap: any, primaryType: ListingType | null): string {
  const objects = (snap?.sample_listings ?? []).map((listing: any, index: number) => ({
    object_id: `OBJECT_${index + 1}`,
    title: listing?.title || null,
    address: listing?.address ?? null,
    neighborhood: listing?.neighborhood ?? null,
    city: listing?.city ?? null,
    rooms: listing?.rooms ?? null,
    sqm: listing?.sqm ?? null,
    price_shekel: listing?.asking_price ?? null,
    transaction_type: listing?.listing_type ?? primaryType,
    price_label: (listing?.listing_type ?? primaryType) === "rent" ? "שכ\"ד ₪/חודש" : "מחיר מבוקש",
    description_excerpt: listing?.description ?? null,
  }));
  return `[STRICT LISTING PAYLOAD JSON]\nThese JSON objects are the ONLY source of property facts. Use the structured fields AND scan description_excerpt for additional facts mentioned by the broker (elevator, parking, floor, balcony, condition, AC, furnishing, pets, move-in). If a fact is asserted in description_excerpt, treat it as TRUE; if denied, treat it as FALSE; if absent from BOTH structured fields and description_excerpt, do not invent it.\n${JSON.stringify(objects, null, 2)}`;
}

function hasUnsupportedPropertyFact(text: string, primaryListing: any): boolean {
  // Only flag fact words that are NOT supported by the primary listing's
  // structured fields or description_excerpt.
  const desc = String(primaryListing?.description ?? "").toLowerCase();
  const checks: Array<[RegExp, RegExp]> = [
    [/מרוהט|ריהוט|furnished|furniture/i, /מרוהט|ריהוט|furnished|furniture/i],
    [/חני[הי]|parking/i, /חני[הי]|parking/i],
    [/מרפסת|balcony|terrace/i, /מרפסת|balcony|terrace/i],
    [/מעלית|elevator|lift/i, /מעלית|elevator|lift/i],
    [/קומה|floor/i, /קומה|floor/i],
    [/מיזוג|מזגן|a\/?c|air\s*condition/i, /מיזוג|מזגן|a\/?c|air\s*condition/i],
  ];
  for (const [outRe, srcRe] of checks) {
    if (outRe.test(text) && !srcRe.test(desc)) return true;
  }
  return false;
}

const NO_ALT_RE = /(אין\s+לי\s+(?:כרגע\s+)?(?:חלופ\S{0,4}|עוד|נכס\S*|דיר\S{0,4}|אופצי\S{0,4})[^\n.!?]{0,100}|אין\s+ברשות[יו][^\n.!?]{0,100}|לא\s+(?:מצאתי|נמצא|מוצא)[^\n.!?]{0,100}(?:חלופ\S{0,4}|אלטרנטיב\S*)|no\s+alternative[s]?\s+available|i\s+don'?t\s+have\s+(?:any\s+)?(?:other|alternative)[^\n.!?]{0,80})/gi;

function stripNoAlternativeDisclaimers(text: string): string {
  if (!text) return "";
  return text
    .replace(NO_ALT_RE, "")
    .split(/\n+/)
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

type FeatureAsk = {
  key: string;
  label_he: string;
  pattern: RegExp;
  // Patterns used to extract a positive/negative answer from description text.
  positive: RegExp;
  negative: RegExp;
};
const FEATURE_ASKS: FeatureAsk[] = [
  {
    key: "elevator", label_he: "מעלית",
    pattern: /מעלית|elevator|lift/i,
    positive: /(יש\s+מעלית|כולל\s+מעלית|עם\s+מעלית|מעלית\s+(?:בבניין|חדשה|פעילה)|has\s+(?:an?\s+)?elevator|with\s+elevator)/i,
    negative: /(אין\s+מעלית|ללא\s+מעלית|no\s+elevator|without\s+elevator)/i,
  },
  {
    key: "parking", label_he: "חניה",
    pattern: /חני[הי]|parking/i,
    positive: /(יש\s+חני[הי]|חני[הי]\s+(?:צמודה|פרטית|בטאבו|מקורה)|כולל\s+חני[הי]|with\s+parking|has\s+parking)/i,
    negative: /(אין\s+חני[הי]|ללא\s+חני[הי]|no\s+parking)/i,
  },
  {
    key: "balcony", label_he: "מרפסת",
    pattern: /מרפסת|balcony|terrace/i,
    positive: /(יש\s+מרפסת|מרפסת\s+(?:שמש|גדולה|פתוחה)|כולל\s+מרפסת|with\s+(?:balcony|terrace))/i,
    negative: /(אין\s+מרפסת|ללא\s+מרפסת|no\s+balcony)/i,
  },
  {
    key: "floor", label_he: "קומה",
    pattern: /קומה|floor/i,
    positive: /קומה\s+\S+|floor\s+\d+/i,
    negative: /(?!)/,
  },
  {
    key: "furnished", label_he: "ריהוט",
    pattern: /מרוהט|ריהוט|furnished|furniture/i,
    positive: /(מרוהט|כולל\s+ריהוט|עם\s+ריהוט|furnished)/i,
    negative: /(לא\s+מרוהט|ללא\s+ריהוט|unfurnished)/i,
  },
  {
    key: "pets", label_he: "חיות מחמד",
    pattern: /חיות|כלב|חתול|pet[s]?|dog|cat/i,
    positive: /(חיות\s+מחמד\s+מותר|pet[- ]?friendly|pets\s+allowed)/i,
    negative: /(ללא\s+חיות|אין\s+חיות|no\s+pets)/i,
  },
  {
    key: "move_in", label_he: "מועד כניסה",
    pattern: /מועד\s*כניסה|כניסה\s*מיידית|move[- ]?in|available\s+from/i,
    positive: /(כניסה\s+(?:מיידית|ב\S+)|פנויה\s+(?:מ\S+|מיידית)|available\s+(?:from|now|immediately))/i,
    negative: /(?!)/,
  },
  {
    key: "ac", label_he: "מיזוג",
    pattern: /מיזוג|מזגן|a\/?c|air\s*condition/i,
    positive: /(מיזוג|מזגן|a\/?c|air[- ]?condition)/i,
    negative: /(אין\s+מיזוג|ללא\s+מזגן|no\s+a\/?c)/i,
  },
];

function detectFeatureAsk(inbound: string): FeatureAsk | null {
  for (const f of FEATURE_ASKS) if (f.pattern.test(inbound)) return f;
  return null;
}

type FeatureFact = "yes" | "no" | "unknown";
function extractFeatureFact(ask: FeatureAsk, primaryListing: any): FeatureFact {
  const haystack = [
    primaryListing?.description,
    primaryListing?.title,
    primaryListing?.address,
    primaryListing?.neighborhood,
  ].filter(Boolean).join("\n");
  if (!haystack) return "unknown";
  if (ask.negative.source !== "(?!)" && ask.negative.test(haystack)) return "no";
  if (ask.positive.test(haystack)) return "yes";
  return "unknown";
}

const SYSTEM = `${UDI_PERSONA}

You are an ELITE senior real-estate broker replying personally and in first person to a public social comment. You think like a top closer: every word is a psychological lever — reframe weaknesses as financial wins, demonstrate deep inventory, qualify the lead, and pull them into private DM through curiosity, not through a canned line.

LANGUAGE MIRROR (hard rule):
- Detect dominant language of the inbound text and reply ONLY in that language. Hebrew in -> Hebrew out. English in -> English out. Never mix.

ABSOLUTE PROHIBITIONS (zero tolerance):
- DO NOT mention Udi's biography, past careers, sports, family, or any third-person facts about him.
- DO NOT write the name "אודי ויטמן" / "Udi Vitman" / "Udi" in the body. Write in first person.
- DO NOT use the third person about yourself. Never.
- DO NOT use emojis (max 1, default 0). No em-dash, en-dash, double-dash, markdown, hashtags.
- DO NOT pad with niceties, slogans, mission statements, fluff, or repeated name greetings. Zero name-spamming. Zero biographical fluff.
- DO NOT use the canned line "שלחתי לך את הפרטים המלאים והסרטון ישירות לפרטי / למסנג'ר. כנס לבדוק." or any English equivalent. This phrase is BANNED. Public reply must read like a natural one-liner from a senior expert, not a CRM auto-responder. Do not advertise the DM at all.
- DO NOT write any "no alternatives" disclaimer. If no compatible alternative exists, stay silent about it.

PUBLIC COMMENT — SENIOR BROKER ONE-LINER:
- HARD LIMIT: 1 sentence, max 22 words. Never 2 sentences. Never long.
- Answer the feature question DIRECTLY from [STRICT LISTING PAYLOAD JSON] (structured fields + description_excerpt). You are the broker — you ALREADY know the property.
- If the fact is present: state it plainly ("יש מעלית וממ"ד" / "אין מעלית, יש ממ"ד" / "קומה 4 עם מעלית").
- If the fact is genuinely absent from BOTH structured fields and description_excerpt: answer briefly with what IS known and skip the missing item — never write "אני אבדוק", "אני צריך לבדוק", "אבדוק ואחזור", "I'll check", "let me verify", "I need to find out", or any equivalent. The broker never asks himself.
- No CTA, no DM advertisement, no question in the public comment.

PRIVATE MESSENGER DM — SENIOR BROKER UPSCALE PLAY:
- HARD LIMIT: 2 to 3 short lines total. Never 4+. Each line under 18 words.
- Line 1: one-line direct answer tied to their question, grounded in the listing fact.
- Line 2 (optional): one-line value reframe OR one peer alternative from [STRICT LISTING PAYLOAD JSON] within ±15% — never both.
- Final line: EXACTLY ONE short qualifying question (budget / move-in / must-haves / family size). Never more than one question, and never in the public comment.
- Same "no self-checking" rule as public: never say you'll go check, verify, or find out. Answer from data you have.

MANDATORY GROUNDING:
- Every property fact MUST come from [STRICT LISTING PAYLOAD JSON]. Scan description_excerpt for elevator/parking/floor/balcony/AC/furnishing/pets/move-in/ממ"ד/mamad. If asserted -> TRUE; if denied -> FALSE; if absent from BOTH -> state only what IS known, pivot to a confirmed attribute. Never invent. Never promise to verify.
- Always acknowledge the primary property by its name/city/rooms in the DM.
- STRICT TRANSACTION FIREWALL: rental context -> rental terminology only (שכ"ד ₪/חודש). Sale context -> sale terminology only. Never cross.

OUTPUT FORMAT (STRICT JSON, no markdown, no code fence, no commentary):
{
  "public_comment": "<1 sentence (max 2). Direct answer + market reframe if relevant. NO DM advertisement. NO banned closing line. NO question.>",
  "private_messenger_dm": "<4-6 short lines following the senior-broker upscale structure above, ending with exactly ONE high-yield hook question.>"
}

GENDER (Hebrew only): match Hebrew gender to the sender's first name when known; unknown -> masculine singular. Never slash forms.

${ANTI_SPAM_RULES}
- Quote or paraphrase 1-2 specific words from THIS commenter's text in the public_comment so it is provably context-bound.

Return ONLY the raw JSON object described above. Nothing else.`;

function isLangMismatch(reply: string, target: "he" | "en" | "other"): boolean {
  if (!reply.trim()) return false;
  const hasHe = /[\u0590-\u05FF]/.test(reply);
  const hasEn = /[A-Za-z]/.test(reply);
  if (target === "en") return hasHe || !hasEn;
  if (target === "he") return hasEn || !hasHe;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");
    const body = await req.json().catch(() => ({}));
    const inbound = String(body?.inbound_text ?? "").trim();
    if (!inbound) {
      return new Response(JSON.stringify({ error: "inbound_text required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const platform = typeof body?.platform === "string" ? body.platform : "";
    const sender = typeof body?.sender_handle === "string" ? body.sender_handle : "";
    const rawCampaignContext =
      typeof body?.campaign_context === "string" ? body.campaign_context.slice(0, 1400) : "";
    const regenerate = Boolean(body?.regenerate);
    const targetLang = detectDominantLanguage(inbound);
    const firstName = sender.trim().split(/[\s_.@]+/)[0] || "";

    // Resolve workspace user_id (body wins, else from caller JWT) for KB scoping.
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    let userId: string | null = typeof body?.user_id === "string" ? body.user_id : null;
    if (!userId) {
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
      if (token) {
        try {
          const { data } = await admin.auth.getUser(token);
          userId = data?.user?.id ?? null;
        } catch { /* ignore */ }
      }
    }

    // STRICT TRANSACTION TYPE ALIGNMENT — resolve the primary listing's
    // sale/rent type so we NEVER cross-reference sale alternatives to a
    // rental lead (or vice-versa).
    let primaryListing: {
      title: string;
      city: string | null;
      asking_price: number | null;
      listing_type: ListingType | null;
      rooms: number | null;
      sqm: number | null;
      description: string | null;
      address: string | null;
      neighborhood: string | null;
    } | null = null;
    let primaryType: ListingType | null = null;
    let primaryTypeLocked = false;
    const explicitType = String(body?.listing_type ?? "").toLowerCase();
    if (explicitType === "rent" || explicitType === "sale") {
      primaryType = explicitType as ListingType;
      primaryTypeLocked = true;
    }
    const primaryListingId = typeof body?.primary_listing_id === "string" ? body.primary_listing_id : null;
    if (primaryListingId) {
      try {
        const { data: row } = await admin
          .from("listings")
          .select("property_title,city,address,neighborhood,asking_price,features,rooms,sqm,description")
          .eq("id", primaryListingId)
          .maybeSingle();
        if (row) {
          const lt = resolveListingType(row as any);
          const effectiveType = primaryType ?? lt;
          if (!effectiveType || isListingAllowedForType({ ...(row as any), listing_type: lt }, effectiveType)) {
            primaryListing = {
              title: String((row as any).property_title ?? ""),
              city: (row as any).city ?? null,
              asking_price: (row as any).asking_price ?? null,
              listing_type: lt,
              rooms: (row as any).rooms ?? null,
              sqm: (row as any).sqm ?? null,
              description: (row as any).description ? String((row as any).description).slice(0, 4000) : null,
              address: (row as any).address ?? null,
              neighborhood: (row as any).neighborhood ?? null,
            };
            if (!primaryType && lt) primaryType = lt;
            if (lt) primaryTypeLocked = true;
          }
        }
      } catch { /* ignore */ }
    }

    if (!primaryType) {
      const haystack = `${inbound}\n${rawCampaignContext}`.toLowerCase();
      const rentHit = RENT_SIGNAL_RE.test(haystack);
      const saleHit = SALE_SIGNAL_RE.test(haystack);
      if (rentHit) primaryType = "rent";
      else if (saleHit && !rentHit) primaryType = "sale";
    }

    if (!primaryListing && userId) {
      try {
        const { data: liveRows } = await admin
          .from("listings")
          .select("property_title,address,neighborhood,city,asking_price,features,rooms,sqm,status,is_published,description")
          .eq("user_id", userId)
          .eq("status", "live")
          .eq("is_published", true)
          .limit(120);
        // STRICT POST-SCOPED MATCH: the source of truth for "which property is
        // this comment about" is the published post body of THIS campaign,
        // NOT the inbound comment text and NOT a generic CRM fallback. Score
        // every listing by how strongly its identifiers appear in the post
        // body. Address > property_title > neighborhood; bare city is too
        // weak to count alone and was leaking cross-listing replies.
        const postBody = String(body?.campaign_post_body ?? "").toLowerCase();
        const score = (row: any): number => {
          if (!postBody) return 0;
          const addr = normalizeText(row?.address);
          const title = normalizeText(row?.property_title);
          const hood = normalizeText(row?.neighborhood);
          let s = 0;
          if (addr && addr.length >= 4 && postBody.includes(addr)) s += 100;
          if (title && title.length >= 4 && postBody.includes(title)) s += 60;
          if (hood && hood.length >= 4 && postBody.includes(hood)) s += 20;
          return s;
        };
        const scored = (liveRows ?? [])
          .map((row: any) => ({ row, listing_type: resolveListingType(row), s: score(row) }))
          .filter((entry) => entry.s > 0)
          .sort((a, b) => b.s - a.s);
        const row = scored[0]?.row ?? null;
        if (row) {
          const lt = scored[0].listing_type ?? primaryType;
          primaryListing = {
            title: String((row as any).property_title ?? (row as any).address ?? ""),
            city: (row as any).city ?? null,
            asking_price: (row as any).asking_price ?? null,
            listing_type: lt,
            rooms: (row as any).rooms ?? null,
            sqm: (row as any).sqm ?? null,
            description: (row as any).description ? String((row as any).description).slice(0, 4000) : null,
            address: (row as any).address ?? null,
            neighborhood: (row as any).neighborhood ?? null,
          };
          // The matched listing's own type wins over weak inbound-text heuristics.
          primaryType = lt ?? primaryType;
          primaryTypeLocked = true;
          console.log("[suggest-comment-reply] primary listing locked by post-body match", {
            title: primaryListing.title,
            score: scored[0].s,
            listing_type: lt,
          });
        } else {
          console.warn("[suggest-comment-reply] no listing matched the post body — skipping primary listing to avoid cross-leak");
        }
      } catch (e) { console.error("[suggest-comment-reply] primary resolution failed", e); }
    }


    const [kbSnippets, crmSnap] = await Promise.all([
      loadKbSnippets(admin, userId),
      loadCrmSnapshot(admin, userId, { listingType: primaryType }),
    ]);

    // Only force rental-mode when the primary listing itself is a rental.
    // Previously this fired on any RENT_SIGNAL in inbound/campaign text and
    // even hardcoded הבשן 3 as a fallback, which leaked the wrong property.
    const rentalOnlyMode = primaryType === "rent";
    const rentalContextConflict = rentalOnlyMode && hasStaleSaleContext(rawCampaignContext);
    const campaignContext = rentalOnlyMode
      ? scrubRentalCampaignContext(rawCampaignContext)
      : rawCampaignContext;
    const isolatedSnap = isolateSnapshotForPrompt(crmSnap, primaryType, primaryListing?.asking_price ?? null);
    const promptSnap = rentalContextConflict || (rentalOnlyMode && primaryListing)
      ? forceSingleRentalSnapshot(isolatedSnap, primaryListing)
      : isolatedSnap;
    const promptKb = primaryType ? "" : scrubKbForTransaction(kbSnippets, primaryType);

    // High-entropy seed forces lexical/structural variation across calls.
    const entropySeed = `${crypto.randomUUID()}-${Date.now()}`;

    const transactionBlock = primaryType
      ? [
          `STRICT TRANSACTION TYPE (locked): the primary property is ${
            primaryType === "rent" ? "FOR RENT (להשכרה)" : "FOR SALE (למכירה)"
          }.`,
          primaryType === "rent"
            ? "Use rental terminology ONLY and quote every price as monthly rent: שכ\"ד ₪/חודש / דמי שכירות חודשיים / שכר דירה / פנויה לכניסה / חוזה / פיקדון / move-in date / monthly rent. NEVER say מחיר מבוקש, משכנתא, רכישה, mortgage, purchase, buyers, ROI on purchase."
            : "Use sale terminology ONLY: מחיר מבוקש / רכישה / משכנתא / בעלות / mortgage / purchase / buyers. NEVER say שכ\"ד / דמי שכירות / שכירות חודשית / monthly rent / lease / tenants.",
          `Alternative listings MUST be ${primaryType.toUpperCase()} ONLY and within ±15% of the primary ${
            primaryType === "rent" ? "monthly rent" : "asking price"
          }${
            primaryListing?.asking_price
              ? ` (${primaryListing.asking_price.toLocaleString("he-IL")} ש"ח)`
              : ""
          }. If no compatible ${primaryType} alternative exists in CRM, omit the alternative — do NOT substitute the other transaction type.`,
          rentalOnlyMode
            ? RENTAL_DELETION_OVERRIDE
            : null,
          rentalOnlyMode && (promptSnap?.sample_listings ?? []).length === 0
            ? "EMPTY RENTAL SNAPSHOT: focus the reply entirely on the primary property's confirmed facts. Do NOT mention the absence of alternatives in any words."
            : null,
          rentalOnlyMode
            ? "Qualification question (pick ONE, rental-only, prefer the first): \"מה מועד הכניסה המועדף עליכם?\" / \"לכמה זמן אתם מחפשים לשכור?\" / \"צריכים חניה או מעלית?\"."
            : "Qualification question (pick ONE, sale-only): exact budget ceiling, mortgage status, move-in horizon, must-have neighborhood, parking/floor preference.",
        ].join("\n")
      : null;

    const primaryBlock = primaryListing
      ? `[PRIMARY PROPERTY DISCUSSED — LOCKED]: ${primaryListing.title}${primaryListing.address ? " · " + primaryListing.address : ""}${primaryListing.city ? " · " + primaryListing.city : ""}${primaryListing.rooms ? " · " + primaryListing.rooms + " חד'" : ""}${primaryListing.sqm ? " · " + primaryListing.sqm + " מ\"ר" : ""}${primaryListing.asking_price ? " · " + Number(primaryListing.asking_price).toLocaleString("he-IL") + " ש\"ח" : ""}${primaryListing.listing_type ? " · " + (primaryListing.listing_type === "rent" ? "להשכרה" : "למכירה") : ""}.\nHARD RULE: this is the ONE property this comment is about. NEVER name, hint at, or compare to any other property, street, or address in either public_comment or private_messenger_dm. Do not reference פורצי הדרך, הבשן, or any address other than the one above. If [STRICT LISTING PAYLOAD JSON] contains other listings, IGNORE them for this reply — they are NOT the subject of this post.`
      : `[PRIMARY PROPERTY DISCUSSED — UNRESOLVED]: no listing was matched from the published post body. Reply generically about the post WITHOUT naming any specific street, address, or listing. NEVER invent a property name.`;

    const featureAsk = detectFeatureAsk(inbound);
    const featureFact: FeatureFact = featureAsk ? extractFeatureFact(featureAsk, primaryListing) : "unknown";
    const featureAnswerHe = featureAsk
      ? (featureFact === "yes"
          ? `כן, יש ${featureAsk.label_he} בנכס.`
          : featureFact === "no"
          ? `אין ${featureAsk.label_he} בנכס.`
          : `${featureAsk.label_he} לא מצוין במפרט הנכס.`)
      : "";
    const featureAskBlock = featureAsk
      ? `[FEATURE QUESTION DETECTED]: the commenter explicitly asked about "${featureAsk.label_he}".\nGROUND-TRUTH ANSWER from listing data: ${featureFact.toUpperCase()}.\nOpen public_comment AND private_messenger_dm with this factual answer in the matched language. Suggested Hebrew phrasing: "${featureAnswerHe}". If GROUND-TRUTH = UNKNOWN: state plainly that this attribute is not specified in the listing spec ("${featureAsk.label_he} לא מצוין במפרט") and pivot to a confirmed attribute (rooms, sqm, monthly rent, street). NEVER write "אבדוק", "אני אבדוק", "אעדכן אותך", "I'll check", "let me verify", "I need to find out", or any equivalent — the broker already owns the listing and answers from data, not from future research.\nALSO scan description_excerpt inside [STRICT LISTING PAYLOAD JSON] for any additional facts (PDF-extracted) and quote them when relevant.`
      : null;

    const userPrompt = [
      platform ? `Platform: ${platform}` : null,
      firstName ? `Sender first name: ${firstName}` : null,
      campaignContext ? `Campaign context:\n"""${campaignContext}"""` : null,
      primaryBlock,
      transactionBlock,
      featureAskBlock,
      renderCrmBlock(promptSnap),
      renderStrictListingPayload(promptSnap, primaryType),
      renderKbBlock(promptKb),
      `Required reply language: ${
        targetLang === "en" ? "English only" : targetLang === "he" ? "Hebrew only" : "same language as inbound"
      }.`,
      `Anti-spam entropy seed (vary opener, sentence shapes, vocabulary and CTA wording): ${entropySeed}`,
      `Reply MUST quote or paraphrase at least one specific detail from the inbound text below.`,
      `FORBIDDEN: any "no alternatives / I don't have other listings" disclaimer. If no alternative exists, stay silent about it.`,
      `Inbound comment:\n"""${inbound}"""`,
      regenerate ? "Produce a structurally fresh angle: different opener, different sentence count, different CTA shape." : null,
    ].filter(Boolean).join("\n\n");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: [
              rentalOnlyMode ? `${SYSTEM}\n\n${RENTAL_DELETION_OVERRIDE}` : SYSTEM,
              await fetchLearnedOverridesBlock(admin as any, userId),
            ].filter(Boolean).join("\n\n") },
          { role: "user", content: userPrompt },
        ],
        temperature: regenerate ? 1.05 : 0.95,
        top_p: 0.95,
        presence_penalty: 0.7,
        frequency_penalty: 0.85,
        max_tokens: 500,
      }),
    });

    if (!aiRes.ok) {
      const status = aiRes.status;
      const msg = status === 429
        ? "Rate limited, try again shortly"
        : status === 402
        ? "AI credits exhausted"
        : `AI gateway ${status}`;
      return new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const j = await aiRes.json();
    const raw = String(j?.choices?.[0]?.message?.content ?? "").trim();

    // Strip accidental markdown code fences and extract first JSON object.
    function parseSplit(text: string): { public_comment: string; private_messenger_dm: string } | null {
      if (!text) return null;
      let t = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      const start = t.indexOf("{");
      const end = t.lastIndexOf("}");
      if (start < 0 || end <= start) return null;
      try {
        const obj = JSON.parse(t.slice(start, end + 1));
        const pub = sanitizeOutboundText(String(obj?.public_comment ?? "")).trim();
        const dm = sanitizeOutboundText(String(obj?.private_messenger_dm ?? "")).trim();
        if (!pub) return null;
        return { public_comment: pub, private_messenger_dm: dm };
      } catch {
        return null;
      }
    }

    let split = parseSplit(raw);
    // Fallback: treat the whole response as the public_comment if JSON parsing failed.
    if (!split) {
      const pub = sanitizeOutboundText(raw);
      split = { public_comment: pub, private_messenger_dm: "" };
    }

    if (isLangMismatch(split.public_comment, targetLang)) {
      const retry = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              content: `Rewrite BOTH fields in ${
                targetLang === "en"
                  ? "natural English only"
                  : targetLang === "he"
                  ? "natural Hebrew only"
                  : "the same language as the original inbound text only"
              }. Return STRICT JSON {"public_comment": "...", "private_messenger_dm": "..."}. No mixing, no explanation, no code fence.`,
            },
            {
              role: "user",
              content: `Inbound:\n"""${inbound}"""\n\nCurrent draft JSON:\n${JSON.stringify(split)}`,
            },
          ],
        }),
      });
      if (retry.ok) {
        const rj = await retry.json();
        const retried = parseSplit(String(rj?.choices?.[0]?.message?.content ?? ""));
        if (retried) split = retried;
      }
    }

    if (primaryType === "rent" && (hasRentalSaleLeak(`${split.public_comment}\n${split.private_messenger_dm}`) || hasUnsupportedPropertyFact(`${split.public_comment}\n${split.private_messenger_dm}`, primaryListing))) {
      const featureAnswerLine = featureAsk ? featureAnswerHe : "";
      const specsLine = primaryListing
        ? `${primaryListing.title}${primaryListing.city ? ", " + primaryListing.city : ""}${primaryListing.rooms ? ", " + primaryListing.rooms + " חדרים" : ""}${primaryListing.sqm ? ", " + primaryListing.sqm + " מ\"ר" : ""}${primaryListing.asking_price ? ", שכ\"ד " + Number(primaryListing.asking_price).toLocaleString("he-IL") + " ₪/חודש" : ""}.`
        : "";
      const reframeLine = featureAsk && featureFact === "no" && primaryListing?.asking_price
        ? `דווקא בגלל ש${featureAnswerLine.replace(/\.$/, "")}, שכר הדירה כאן נמוך משמעותית ממחירי השוק באזור — הזדמנות אמיתית לחסוך אלפי שקלים בשנה.`
        : "";
      const safeDm = ["היי, תודה שפנית.", featureAnswerLine, reframeLine, specsLine, "מה מועד הכניסה המועדף עליכם?"]
        .filter(Boolean).join("\n");
      const pubAnswer = featureAsk && featureFact === "no" && primaryListing
        ? `${featureAnswerLine.replace(/\.$/, "")}, וזו בדיוק הסיבה ששכר הדירה כאן הוא כנראה הכי משתלם שתמצא באזור כרגע.`
        : (featureAsk
            ? featureAnswerHe
            : (primaryListing
                ? `יש לי את הפרטים על ${primaryListing.title}${primaryListing.rooms ? `, ${primaryListing.rooms} חדרים` : ""}${primaryListing.asking_price ? `, שכ\"ד ${Number(primaryListing.asking_price).toLocaleString("he-IL")} ₪/חודש` : ""}.`
                : "יש לי את כל הפרטים הרלוונטיים עבורך."));
      split = {
        public_comment: sanitizeOutboundText(pubAnswer).trim(),
        private_messenger_dm: sanitizeOutboundText(safeDm).trim(),
      };
    }

    // Final guardrail: strip "no alternatives" disclaimers + the banned canned
    // DM-advertisement closing line that we never want in public comments.
    const BANNED_CLOSING_RE = /\s*(?:שלחתי\s+לך[^.\n]{0,120}(?:פרטי|מסנג'?ר|messenger)[^.\n]{0,120}(?:בדוק|check)[^.\n]{0,60}\.?|I\s+just\s+sent\s+you[^.\n]{0,140}(?:DM|Messenger)[^.\n]{0,100}\.?)/gi;
    const scrubBannedClosing = (t: string) =>
      (t || "").replace(BANNED_CLOSING_RE, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    split = {
      public_comment: scrubBannedClosing(stripNoAlternativeDisclaimers(split.public_comment)),
      private_messenger_dm: stripNoAlternativeDisclaimers(split.private_messenger_dm),
    };

    if (!split.public_comment) {
      return new Response(JSON.stringify({ error: "empty AI reply" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        // Backward compat: existing UI reads `draft` for the public comment textarea.
        draft: split.public_comment,
        public_comment: split.public_comment,
        private_messenger_dm: split.private_messenger_dm,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
