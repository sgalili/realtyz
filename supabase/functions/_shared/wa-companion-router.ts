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
  /^\s*(צור|תייצר|תכין|תכתוב|כתוב|תפיק)\s+(לי\s+)?(פוסט|פרסום|מודעה|תוכן)\b/i,
  /^\s*(post|create post|generate post|write post)\b/i,
  /^\s*#?פוסט[:\s]/i,
];

const REPLY_TRIGGERS = [
  /^\s*(תגובה|השב|תענה|ענה|רספונס)\b/i,
  /^\s*(reply|respond|answer)\b/i,
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

function isPostCommand(t: string) { return POST_TRIGGERS.some((r) => r.test(t)); }
function isReplyCommand(t: string) { return REPLY_TRIGGERS.some((r) => r.test(t)); }
function matchHeavy(t: string) { return HEAVY_DEEPLINKS.find((h) => h.test.test(t)); }

// Strip the leading trigger word so the remainder is the actual content.
function stripTrigger(t: string): string {
  let out = t.trim();
  for (const r of [...POST_TRIGGERS, ...REPLY_TRIGGERS]) out = out.replace(r, "").trim();
  out = out.replace(/^[:\-–—]\s*/, "").trim();
  return out;
}

// ----- listing resolver -------------------------------------------------

async function resolveOwnerListing(admin: any, userId: string, text: string) {
  const { data } = await admin
    .from("listings")
    .select("id, property_title, address, asking_price, status, created_at")
    .eq("user_id", userId)
    .in("status", ["live", "pending"])
    .order("created_at", { ascending: false })
    .limit(25);
  const rows = (data ?? []) as any[];
  if (!rows.length) return null;
  const lower = text.toLowerCase();
  const hit = rows.find((r) =>
    [r.property_title, r.address].filter(Boolean).some((s: string) => lower.includes(String(s).toLowerCase().slice(0, 20))),
  );
  return hit ?? rows[0];
}

// ----- POST GENERATION command -----------------------------------------

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
        customInstructions: "Drafted via WhatsApp companion. Keep concise.",
        selectedListingId: listing?.id ?? null,
        listingFocusOnly: !!listing,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`generate-content ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
    const draft = String(j?.content ?? j?.text ?? "").trim();
    if (!draft) throw new Error("empty draft");

    // Queue the draft for review (non-fatal if table shape differs).
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
          metadata: { listing_id: listing?.id ?? null, topic, via: "wa_router" },
        })
        .select("id")
        .maybeSingle();
      queueId = q?.id ?? null;
    } catch (_) { /* best-effort */ }

    const deepLink = `${DASHBOARD_BASE}/campaigns${queueId ? `?draft=${queueId}` : ""}`;
    const reply =
      `✍️ טיוטת פוסט מוכנה${listing ? ` עבור ${listing.property_title ?? listing.address}` : ""}:\n\n` +
      `${draft.slice(0, 700)}${draft.length > 700 ? "…" : ""}\n\n` +
      `כדי לפרסם / לערוך / לבחור Final Version: ${deepLink}`;
    return { handled: true, action: "post_generated", reply, meta: { queueId, listingId: listing?.id ?? null } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return {
      handled: true,
      action: "post_failed",
      reply: `לא הצלחתי לייצר טיוטה כרגע (${msg.slice(0, 80)}). אפשר לנסות שוב או לעבור ל-${DASHBOARD_BASE}/campaigns`,
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
      reply: `אין תגובה ממתינה ב-48 השעות האחרונות. ניתן להגיב ידנית מהדשבורד: ${DASHBOARD_BASE}/campaigns`,
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
  if (isPostCommand(t)) return handlePostCommand(ctx);
  if (isReplyCommand(t)) return handleReplyCommand(ctx);
  const heavy = handleHeavyDeepLink(ctx);
  if (heavy.handled) return heavy;
  return { handled: false };
}

export async function lookupOwnerByPhone(admin: any, phone: string): Promise<string | null> {
  const { data } = await admin
    .from("kb_whitelist")
    .select("user_id")
    .eq("phone_number", phone)
    .maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}
