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
  isListingAllowedForType,
  UDI_PERSONA,
  ANTI_SPAM_RULES,
  CTA_RULE,
  type ListingType,
} from "../_shared/grounding.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const SALE_LEAK_RE = /(פורצי הדרך|אבן גבירול|למכירה|מחיר מבוקש|משכנתא|רכישה|לקנות|2,?290,?000|for sale|asking price|mortgage|purchase)/i;

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

function scrubKbForTransaction(kb: string, primaryType: ListingType | null): string {
  if (!kb || primaryType !== "rent") return kb;
  return kb
    .split(/\n---\n/g)
    .filter((chunk) => !SALE_LEAK_RE.test(chunk) && !/(^|[^\d])\d{1,3}[,.]?\d{3}[,.]?\d{3}([^\d]|$)/.test(chunk))
    .join("\n---\n");
}

const SYSTEM = `${UDI_PERSONA}

You are replying to a single public social comment (Facebook, Instagram, etc) as the broker, personally and in first person. Your job is to SELL the relevant property, not to introduce Udi as a human.

LANGUAGE MIRROR (hard rule):
- Detect dominant language of the inbound text and reply ONLY in that language. Hebrew in -> Hebrew out. English in -> English out. Never mix, never append translations, never default to Hebrew.

ABSOLUTE PROHIBITIONS (zero tolerance — breaking any of these voids the reply):
- DO NOT mention Udi's biography, background, past management roles, sports, fitness, coaching, USA history, prior careers, personal stories, family, or any third-person facts about him. The KB is for VOICE & domain knowledge only — never for biographical name-dropping.
- DO NOT write the name "אודי ויטמן" / "Udi Vitman" / "Udi" in the body. Write in first person ("אצלי במאגר", "שלחתי לך", "יש לי", "I have", "I just sent you").
- DO NOT use the third person about yourself ("אודי הוא…", "Udi has…"). Never.
- DO NOT use emojis. Maximum 1 emoji per reply, and only if it adds real value. Default: zero emojis.
- DO NOT pad with niceties, slogans, mission statements, or fluff.

MANDATORY MULTI-SOURCE GROUNDING:
- Every property fact (rooms, price, sqm, floor, elevator, parking, neighborhood, street) MUST come from [LIVE PROPERTIES & CRM CONTEXT]. Never invent.
- STRICT TRANSACTION TYPE FIREWALL: if the primary property is FOR RENT, alternatives and terminology MUST be RENTAL only (שכ"ד חודשי / monthly rent / lease / move-in). If FOR SALE, alternatives and terminology MUST be SALE only (מחיר מבוקש / purchase / mortgage). Crossing these is FORBIDDEN.
- If the commenter asked a yes/no attribute (elevator? parking? balcony?) and the data is in CRM, answer it directly and truthfully. If not in CRM, pivot to a concrete attribute that IS in CRM (room count, price, street, floor) without claiming the unknown attribute exists.
- If the KB and CRM truly cannot answer, say honestly you'll verify and follow up in DM. Never fabricate.

OUTPUT FORMAT (STRICT JSON, no markdown, no code fence, no commentary):
{
  "public_comment": "<1 to 2 SHORT sentences max. Direct answer to the commenter's explicit question using real attributes from CRM. End with exactly this closing in the matched language. Hebrew closing: 'שלחתי לך את כל הפרטים המלאים והתמונות ישירות לפרטי / למסנג'ר. כנס לבדוק.' English closing: 'I just sent you the full details and photos straight to your DM / Messenger. Check it out.'>",
  "private_messenger_dm": "<3 to 5 short lines. Detail the SPECIFIC property the commenter is asking about using CRM facts (rooms, sqm, floor, price, street/neighborhood, key features). Offer ONE alternative only if an allowed same-transaction listing appears in LIVE PROPERTIES & CRM CONTEXT within ~15% of the same price band; if none appears, propose NO alternative at all. Close with exactly ONE high-yield qualifying question (move-in date, exact budget ceiling, parking requirement, floor preference, must-have neighborhoods). No emojis. No biography. First person.>"
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
    } | null = null;
    let primaryType: ListingType | null = null;
    const explicitType = String(body?.listing_type ?? "").toLowerCase();
    if (explicitType === "rent" || explicitType === "sale") {
      primaryType = explicitType as ListingType;
    }
    const primaryListingId = typeof body?.primary_listing_id === "string" ? body.primary_listing_id : null;
    if (primaryListingId) {
      try {
        const { data: row } = await admin
          .from("listings")
          .select("property_title,city,asking_price,features,rooms,sqm")
          .eq("id", primaryListingId)
          .maybeSingle();
        if (row) {
          const lt = extractListingTypeFromFeatures((row as any).features);
          primaryListing = {
            title: String((row as any).property_title ?? ""),
            city: (row as any).city ?? null,
            asking_price: (row as any).asking_price ?? null,
            listing_type: lt,
            rooms: (row as any).rooms ?? null,
            sqm: (row as any).sqm ?? null,
          };
          if (!primaryType && lt) primaryType = lt;
        }
      } catch { /* ignore */ }
    }

    // Heuristic fallback: detect transaction type from inbound text + campaign
    // context when neither primary_listing_id nor explicit listing_type was
    // provided. Hebrew + English rental/sale keyword sniff.
    if (!primaryType) {
      const haystack = `${inbound}\n${rawCampaignContext}`.toLowerCase();
      const rentSignals = /(להשכרה|שכירות|לשכור|להשכיר|שכר דירה|שכ"?ד|\brent(al|s)?\b|\bfor rent\b|\blease\b|\bto let\b)/i;
      const saleSignals = /(למכירה|לרכישה|לקנות|נמכרת|רכישה|\bfor sale\b|\bbuy(ing)?\b|\bpurchase\b|\bmortgage\b|משכנתא)/i;
      const rentHit = rentSignals.test(haystack);
      const saleHit = saleSignals.test(haystack);
      if (rentHit && !saleHit) primaryType = "rent";
      else if (saleHit && !rentHit) primaryType = "sale";
    }

    // Fresh live DB resolution: regeneration must not trust campaign_logs text
    // or older generated post context as the property source of truth. Match the
    // inbound/post text against current live listings, then re-lock type/price
    // from the active listing row only.
    if (!primaryListing && userId) {
      try {
        const { data: liveRows } = await admin
          .from("listings")
          .select("property_title,address,neighborhood,city,asking_price,features,rooms,sqm,status,is_published")
          .eq("user_id", userId)
          .eq("status", "live")
          .eq("is_published", true)
          .limit(120);
        const haystack = `${inbound}\n${rawCampaignContext}`;
        const liveMatches = (liveRows ?? [])
          .map((row: any) => ({ ...row, listing_type: extractListingTypeFromFeatures(row.features) }))
          .filter((row: any) => (!primaryType || isListingAllowedForType(row, primaryType)) && overlapsListingText(haystack, row));
        const row = liveMatches[0] ?? null;
        if (row) {
          const lt = extractListingTypeFromFeatures((row as any).features) ?? primaryType;
          primaryListing = {
            title: String((row as any).property_title ?? (row as any).address ?? ""),
            city: (row as any).city ?? null,
            asking_price: (row as any).asking_price ?? null,
            listing_type: lt,
            rooms: (row as any).rooms ?? null,
            sqm: (row as any).sqm ?? null,
          };
          if (lt) primaryType = lt;
        }
      } catch { /* ignore */ }
    }


    const [kbSnippets, crmSnap] = await Promise.all([
      loadKbSnippets(admin, userId),
      loadCrmSnapshot(admin, userId, { listingType: primaryType }),
    ]);

    const campaignContext = primaryType === "rent" && SALE_LEAK_RE.test(rawCampaignContext)
      ? "[campaign post context omitted: stale sale wording detected; use LIVE PROPERTIES & CRM CONTEXT only]"
      : rawCampaignContext;
    const promptSnap = isolateSnapshotForPrompt(crmSnap, primaryType, primaryListing?.asking_price ?? null);
    const promptKb = scrubKbForTransaction(kbSnippets, primaryType);

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
          primaryType === "rent"
            ? "Qualification question (pick ONE, rental-only): \"לכמה זמן אתם מחפשים לשכור?\" / \"מה מועד הכניסה המועדף עליכם?\" / \"צריכים חניה או מעלית?\" / \"כמה דיירים יגורו בנכס?\"."
            : "Qualification question (pick ONE, sale-only): exact budget ceiling, mortgage status, move-in horizon, must-have neighborhood, parking/floor preference.",
        ].join("\n")
      : null;

    const primaryBlock = primaryListing
      ? `[PRIMARY PROPERTY DISCUSSED]: ${primaryListing.title}${primaryListing.city ? " · " + primaryListing.city : ""}${primaryListing.rooms ? " · " + primaryListing.rooms + " חד'" : ""}${primaryListing.sqm ? " · " + primaryListing.sqm + " מ\"ר" : ""}${primaryListing.asking_price ? " · " + Number(primaryListing.asking_price).toLocaleString("he-IL") + " ש\"ח" : ""}${primaryListing.listing_type ? " · " + (primaryListing.listing_type === "rent" ? "להשכרה" : "למכירה") : ""}.`
      : null;

    const userPrompt = [
      platform ? `Platform: ${platform}` : null,
      firstName ? `Sender first name: ${firstName}` : null,
      campaignContext ? `Campaign context:\n"""${campaignContext}"""` : null,
      primaryBlock,
      transactionBlock,
      renderCrmBlock(promptSnap),
      renderKbBlock(promptKb),
      `Required reply language: ${
        targetLang === "en" ? "English only" : targetLang === "he" ? "Hebrew only" : "same language as inbound"
      }.`,
      `Anti-spam entropy seed (use to vary opener, sentence shapes, vocabulary and CTA wording vs any prior reply): ${entropySeed}`,
      `Reply MUST quote or paraphrase at least one specific detail from the inbound text below so it is provably unique to this commenter.`,
      `CTA invites Messenger DM, WhatsApp, or office call — phrase differently every time.`,
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
          { role: "system", content: SYSTEM },
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
