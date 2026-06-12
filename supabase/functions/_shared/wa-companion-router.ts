// ============================================================
// WhatsApp Companion Router
// ------------------------------------------------------------
// Mirrors core dashboard actions (post generation, comment reply)
// directly via WhatsApp text. Heavy/interactive surfaces (Homely
// ingestion grid, multi-file uploads, complex filters) reply with
// a polite Hebrew message + a deep-link to the exact dashboard page.
//
// Sender scoping:
//   - OWNER  → row in `kb_whitelist` (phone → user_id). May run all
//              generation / reply commands scoped to their own user_id
//              and listings.
//   - TENANT → row in `leads` (phone → lead.id). Existing inbox AI
//              autopilot handles them; this router is bypassed.
// ============================================================

const DASHBOARD_BASE = "https://realtyz.co.il";

// Realtyz AI Master GreenAPI Instance. All owner-companion routing and
// outbound replies are scoped to this single instance.
export const MASTER_INSTANCE_ID = "7103164675";

export type RouterContext = {
  admin: any; // supabase admin client
  supabaseUrl: string;
  serviceKey: string;
  senderPhone: string;
  ownerUserId: string;
  text: string;
};

export type RouterResult =
  | { handled: false }
  | { handled: true; reply: string; action: string; meta?: Record<string, unknown> };

// ----- intent detection -------------------------------------------------

const POST_TRIGGERS = [
  /\b(צור|תייצר|תכין|תכתוב|כתוב|תפיק|הכן|הפק|תפרסם|פרסם)\s+(לי\s+)?(פוסט|פרסום|מודעה|תוכן|סטורי|ריל)\b/i,
  /\bפוסט\s+(על|בשביל|ל)\b/i,
  /\b(post|create post|generate post|write post|draft post)\b/i,
  /^\s*#?פוסט[:\s]/i,
];

// Loose contains-based fallbacks. If ANY of these substrings appears anywhere
// in the normalized text we treat the message as a post-generation intent.
const POST_LOOSE_PHRASES = [
  "תכין פוסט", "תכין לי פוסט", "צור פוסט", "צור לי פוסט",
  "תייצר פוסט", "תכתוב פוסט", "כתוב פוסט", "תפיק פוסט", "הפק פוסט",
  "פוסט על", "פוסט לדירה", "פוסט לנכס", "פוסט שיווקי",
  "תפרסם פוסט", "פרסם פוסט",
];

const REPLY_TRIGGERS = [
  /\b(תגובה|השב|תענה|ענה|תגיב|רספונס)\b/i,
  /\b(reply|respond|answer)\b/i,
  /^\s*#?תגובה[:\s]/i,
];

const HEAVY_DEEPLINKS: Array<{ test: RegExp; path: string; label: string }> = [
  { test: /\b(homely|הומלי|לידים\s+חיצוניים)\b/i, path: "/settings?tab=integrations", label: "ממשק Homely" },
  { test: /\b(העלא|upload|קובץ|files|מסמכים)\b/i, path: "/knowledge", label: "העלאת קבצים" },
  { test: /\b(נכסים|properties|listings)\b/i, path: "/properties", label: "ניהול נכסים" },
  { test: /\b(מתעניינים|leads|לקוחות|crm)\b/i, path: "/leads", label: "ניהול מתעניינים" },
  { test: /\b(קמפיינ|campaigns|דשבורד)\b/i, path: "/campaigns", label: "מרכז הקמפיינים" },
  { test: /\b(insights|תובנות|אנליטיקס|analytics)\b/i, path: "/insights", label: "תובנות" },
  { test: /\b(הגדרות|settings)\b/i, path: "/settings", label: "הגדרות" },
];

function isPostCommand(t: string) {
  if (POST_TRIGGERS.some((r) => r.test(t))) return true;
  const lower = t.toLowerCase();
  return POST_LOOSE_PHRASES.some((p) => lower.includes(p.toLowerCase()));
}
function isReplyCommand(t: string) { return REPLY_TRIGGERS.some((r) => r.test(t)); }
function matchHeavy(t: string) { return HEAVY_DEEPLINKS.find((h) => h.test.test(t)); }

// Strip the leading trigger word so the remainder is the actual content.
function stripTrigger(t: string): string {
  let out = t.trim();
  for (const r of [...POST_TRIGGERS, ...REPLY_TRIGGERS]) out = out.replace(r, "").trim();
  for (const p of POST_LOOSE_PHRASES) {
    const rx = new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
    out = out.replace(rx, "").trim();
  }
  out = out.replace(/^[:\-–—]\s*/, "").trim();
  return out;
}

// ----- listing resolver -------------------------------------------------

// Hebrew/English stop-words we never want to use as a "street name" token.
const TOKEN_STOP = new Set([
  "פוסט","תכתוב","תכין","צור","תייצר","כתוב","תפיק","הכן","הפק","תפרסם","פרסם",
  "על","בשביל","עבור","של","את","עם","ל","ב","ה","לי","לנו","ברחוב","רחוב","דירה","דירת","הדירה",
  "post","create","generate","write","draft","the","a","an","on","for","of",
]);

function tokenize(text: string): string[] {
  return String(text || "")
    .replace(/[^\p{L}\p{N}\s'"-]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !TOKEN_STOP.has(t.toLowerCase()));
}

async function resolveOwnerListing(admin: any, userId: string, text: string) {
  const { data } = await admin
    .from("listings")
    .select("id, property_title, address, city, neighborhood, asking_price, rooms, floor, sqm, parking, elevator, description, features, status, created_at")
    .eq("user_id", userId)
    .in("status", ["live", "pending"])
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as any[];
  if (!rows.length) return null;
  const tokens = tokenize(text).map((t) => t.toLowerCase());
  if (tokens.length === 0) return rows[0];
  // Score by number of token hits inside title+address.
  let best: { row: any; score: number } | null = null;
  for (const r of rows) {
    const hay = [r.property_title, r.address].filter(Boolean).join(" ").toLowerCase();
    if (!hay) continue;
    let score = 0;
    for (const tok of tokens) if (hay.includes(tok)) score += 1;
    if (score > 0 && (!best || score > best.score)) best = { row: r, score };
  }
  return best?.row ?? rows[0];
}

async function lookupOwnerFirstName(admin: any, userId: string, senderPhone?: string): Promise<string | null> {
  // Prefer the per-phone whitelist label so co-managers mapped to the same
  // owner user_id (e.g. Shay → Udi's user_id) still get greeted by their
  // own first name.
  if (senderPhone) {
    try {
      const variants = phoneVariants(senderPhone);
      const { data } = await admin
        .from("kb_whitelist")
        .select("label")
        .in("phone_number", variants)
        .limit(1)
        .maybeSingle();
      const label = (data?.label as string | null)?.trim();
      if (label) {
        const clean = label.replace(/\s*\(pending invite\)\s*/i, "").trim();
        const first = clean.split(/\s+/)[0];
        if (first) return first;
      }
    } catch { /* fall through */ }
  }
  try {
    const { data } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    const full = (data?.full_name as string | null) ?? null;
    if (!full) return null;
    return full.trim().split(/\s+/)[0] ?? null;
  } catch { return null; }
}

// ----- POST GENERATION command -----------------------------------------

function formatIls(n: number | null | undefined): string | null {
  if (!n || !Number.isFinite(Number(n))) return null;
  try { return new Intl.NumberFormat("he-IL").format(Number(n)) + " ₪"; } catch { return String(n); }
}

function buildListingFactSheet(l: any): string {
  if (!l) return "";
  const lines: string[] = [];
  const title = l.property_title || l.address || "הנכס";
  lines.push(`כותרת: ${title}`);
  if (l.address) lines.push(`כתובת: ${l.address}${l.city ? ", " + l.city : ""}`);
  if (l.rooms) lines.push(`חדרים: ${l.rooms}`);
  if (l.floor !== null && l.floor !== undefined) lines.push(`קומה: ${l.floor}`);
  if (l.sqm) lines.push(`שטח: ${l.sqm} מ"ר`);
  if (l.parking) lines.push(`חניה: כן`);
  if (l.elevator) lines.push(`מעלית: כן`);
  const price = formatIls(l.asking_price);
  if (price) lines.push(`מחיר מבוקש: ${price}`);
  // Features may be jsonb array of strings and/or objects.
  if (Array.isArray(l.features)) {
    const flat = l.features
      .map((f: any) => typeof f === "string" ? f : (f && typeof f === "object" ? Object.values(f).filter((v) => typeof v === "string").join(" ") : ""))
      .filter(Boolean);
    if (flat.length) lines.push(`מאפיינים ייחודיים: ${flat.join(", ")}`);
  }
  if (l.description) lines.push(`תיאור: ${String(l.description).slice(0, 400)}`);
  return lines.join("\n");
}

async function handlePostCommand(ctx: RouterContext): Promise<RouterResult> {
  const topic = stripTrigger(ctx.text);
  if (!topic) {
    return {
      handled: true,
      action: "post_help",
      reply: "כדי לייצר פוסט: שלח 'צור פוסט' ואחריו נושא או כתובת נכס. דוגמה: צור פוסט לדירת 4 חדרים בהרצליה.",
    };
  }
  const listing = await resolveOwnerListing(ctx.admin, ctx.ownerUserId, topic);
  const factSheet = buildListingFactSheet(listing);
  const customInstructions = [
    "פוסט שיווקי לפייסבוק בעברית, ממוקד המרה, ללא em-dash וללא '--'.",
    "השתמש אך ורק בנתוני הנכס המופיעים בגיליון העובדות מטה — אסור להמציא חדרים, קומה, מחיר או מאפיינים.",
    "פתח במשפט הוק קצר, פרט 3-5 יתרונות קונקרטיים מהמאפיינים, וסיים בקריאה לפעולה לפנייה ישירה בוואטסאפ.",
    "אורך: 90-160 מילים. בלי האשטגים מוגזמים (עד 3).",
    factSheet ? `\n--- גיליון עובדות הנכס ---\n${factSheet}\n--- סוף ---` : "",
  ].filter(Boolean).join("\n");

  try {
    const res = await fetch(`${ctx.supabaseUrl}/functions/v1/generate-content`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.serviceKey}`,
        "x-impersonate-user": ctx.ownerUserId,
      },
      body: JSON.stringify({
        topic,
        platform: "facebook",
        customInstructions,
        selectedListingId: listing?.id ?? null,
        listingFocusOnly: !!listing,
        listingFacts: factSheet || null,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`generate-content ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
    const draft = String(j?.content ?? j?.text ?? "").trim();
    if (!draft) throw new Error("empty draft");

    // Queue the draft so a follow-up "פרסם" message can publish it.
    let queueId: string | null = null;
    try {
      const { data: q } = await ctx.admin
        .from("approval_queue")
        .insert({
          user_id: ctx.ownerUserId,
          channel: "facebook",
          draft_text: draft,
          source: "whatsapp_companion",
          status: "pending",
          metadata: {
            listing_id: listing?.id ?? null,
            topic,
            via: "wa_router",
            sender_phone: ctx.senderPhone,
            awaiting_publish: true,
          },
        })
        .select("id")
        .maybeSingle();
      queueId = q?.id ?? null;
    } catch (_) { /* best-effort */ }

    const firstName = await lookupOwnerFirstName(ctx.admin, ctx.ownerUserId, ctx.senderPhone);
    const greet = firstName ? `היי ${firstName}` : "היי";
    const subject = listing
      ? `הדירה ב${listing.address ?? listing.property_title}`
      : "הבקשה שלך";
    const reply =
      `${greet}, הנה טיוטת הפוסט השיווקי עבור ${subject}:\n\n` +
      `${draft}\n\n` +
      `כדי לפרסם את הפוסט הזה עכשיו ישירות לפייסבוק, השב להודעה זו במילה "פרסם".`;
    return { handled: true, action: "post_generated", reply, meta: { queueId, listingId: listing?.id ?? null } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return {
      handled: true,
      action: "post_failed",
      reply: `לא הצלחתי לייצר טיוטה כרגע (${msg.slice(0, 80)}). נסה שוב בעוד רגע.`,
    };
  }
}

// ----- PUBLISH command (responds to "פרסם" after a draft) --------------

const PUBLISH_TRIGGERS = [
  /^\s*פרסם\s*!?\s*$/i,
  /^\s*פרסמי\s*!?\s*$/i,
  /^\s*publish\s*!?\s*$/i,
  /^\s*go\s*!?\s*$/i,
];

function isPublishCommand(t: string) {
  return PUBLISH_TRIGGERS.some((r) => r.test(t.trim()));
}

async function handlePublishCommand(ctx: RouterContext): Promise<RouterResult> {
  const { data: pending } = await ctx.admin
    .from("approval_queue")
    .select("id, draft_text, metadata, channel, status")
    .eq("user_id", ctx.ownerUserId)
    .eq("source", "whatsapp_companion")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pending?.draft_text) {
    return {
      handled: true,
      action: "publish_no_draft",
      reply: "אין כרגע טיוטה ממתינה לפרסום. שלח קודם 'צור פוסט על …' ואחר כך 'פרסם'.",
    };
  }
  try {
    const res = await fetch(`${ctx.supabaseUrl}/functions/v1/ayrshare-post`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.serviceKey}`,
        "x-impersonate-user": ctx.ownerUserId,
      },
      body: JSON.stringify({
        post: pending.draft_text,
        channels: ["facebook"],
        campaign_name: "WhatsApp Companion",
        listing_id: (pending.metadata as any)?.listing_id ?? null,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`ayrshare-post ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
    await ctx.admin
      .from("approval_queue")
      .update({ status: "approved", metadata: { ...(pending.metadata ?? {}), published_at: new Date().toISOString() } })
      .eq("id", pending.id);
    return {
      handled: true,
      action: "publish_sent",
      reply: "✅ הפוסט פורסם בפייסבוק.",
      meta: { queueId: pending.id },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return {
      handled: true,
      action: "publish_failed",
      reply: `פרסום הפוסט נכשל (${msg.slice(0, 100)}). אפשר לנסות שוב בעוד רגע.`,
    };
  }
}

// ----- COMMENT REPLY command -------------------------------------------

async function findPendingEngagement(admin: any, userId: string) {
  const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data } = await admin
    .from("engagement_events")
    .select("id, platform, external_id, sender_handle, inbound_text, created_at, status")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .gte("created_at", cutoff)
    .in("status", ["pending", "awaiting_reply", "needs_review", "new"])
    .order("created_at", { ascending: false })
    .limit(1);
  return (data ?? [])[0] ?? null;
}

async function handleReplyCommand(ctx: RouterContext): Promise<RouterResult> {
  const replyText = stripTrigger(ctx.text);
  if (!replyText) {
    return {
      handled: true,
      action: "reply_help",
      reply: "כדי להגיב לתגובה האחרונה: שלח 'תגובה' ואחריו הטקסט שתרצה לפרסם בפייסבוק.",
    };
  }
  const event = await findPendingEngagement(ctx.admin, ctx.ownerUserId);
  if (!event) {
    return {
      handled: true,
      action: "reply_no_pending",
      reply: `אין תגובה ממתינה ב-48 השעות האחרונות.`,
    };
  }
  try {
    const res = await fetch(`${ctx.supabaseUrl}/functions/v1/ayrshare-comment-reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.serviceKey}` },
      body: JSON.stringify({
        event_id: event.id,
        comment: replyText,
        platform: event.platform ?? "facebook",
        user_id: ctx.ownerUserId,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`ayrshare-comment-reply ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
    return {
      handled: true,
      action: "reply_sent",
      reply: `✅ התגובה פורסמה בפייסבוק בשרשור של ${event.sender_handle ?? "המגיב"}.\nלצפייה: ${DASHBOARD_BASE}/campaigns`,
      meta: { event_id: event.id },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return {
      handled: true,
      action: "reply_failed",
      reply: `שליחת התגובה נכשלה (${msg.slice(0, 80)}). אפשר להשלים מהדשבורד: ${DASHBOARD_BASE}/campaigns`,
    };
  }
}

// ----- HEAVY UI fallback -----------------------------------------------

function handleHeavyDeepLink(ctx: RouterContext): RouterResult {
  const m = matchHeavy(ctx.text);
  if (!m) return { handled: false };
  return {
    handled: true,
    action: "deep_link",
    reply: `הפעולה הזו (${m.label}) דורשת ממשק מלא ולא ניתנת לביצוע נוח ב-WhatsApp.\nפתח/י כאן להמשך מיידי: ${DASHBOARD_BASE}${m.path}`,
    meta: { path: m.path },
  };
}

// ----- entry point ------------------------------------------------------

export async function routeOwnerCommand(ctx: RouterContext): Promise<RouterResult> {
  const t = ctx.text.trim();
  if (!t) return { handled: false };
  if (isPublishCommand(t)) return handlePublishCommand(ctx);
  if (isPostCommand(t)) return handlePostCommand(ctx);
  if (isReplyCommand(t)) return handleReplyCommand(ctx);
  const heavy = handleHeavyDeepLink(ctx);
  if (heavy.handled) return heavy;
  return { handled: false };
}

/**
 * Generate every plausible representation of an Israeli phone number so we can
 * match a whitelist row that may have been stored as "0546811841",
 * "972546811841", "+972546811841", or "9725468118 41" (with stray spaces / dashes).
 */
export function phoneVariants(raw: string): string[] {
  const cleaned = String(raw ?? "")
    .replace(/@c\.us$/i, "")
    .replace(/@s\.whatsapp\.net$/i, "")
    .replace(/[^\d+]/g, "");
  let digits = cleaned.replace(/^\+/, "");
  // Normalize to E.164-without-plus starting with 972
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = "972" + digits.slice(1);
  if (digits && !digits.startsWith("972")) digits = "972" + digits;

  const national = digits.startsWith("972") ? "0" + digits.slice(3) : digits;
  const out = new Set<string>([
    digits,
    "+" + digits,
    national,
    raw?.trim() ?? "",
  ].filter(Boolean));
  return Array.from(out);
}

export async function lookupOwnerByPhone(admin: any, phone: string): Promise<string | null> {
  const variants = phoneVariants(phone);
  if (variants.length === 0) return null;
  const { data } = await admin
    .from("kb_whitelist")
    .select("user_id, phone_number")
    .in("phone_number", variants)
    .limit(1)
    .maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}
