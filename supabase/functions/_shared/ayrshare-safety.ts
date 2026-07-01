// Ayrshare account-safety guard.
// Protects the workspace's Ayrshare profile (and by extension every connected
// social account) from suspension by enforcing rate limits, duplicate-content
// blocks, quiet hours and banned-content filters before any outbound call.
//
// Every outbound Ayrshare mutation (post/comment reply/like/delete) MUST go
// through `guardOutboundAction` first. Blocked actions never hit Ayrshare and
// are logged into public.ayrshare_action_log with block_reason.

export type AyrActionType = "post" | "comment_reply" | "like" | "delete";

export interface GuardResult {
  allowed: boolean;
  reason?: string;
  contentHash?: string;
}

// ---- Tunables --------------------------------------------------------------
// Conservative defaults chosen to stay well under Meta/Ayrshare abuse limits.
const LIMITS: Record<AyrActionType, { perMinute: number; perHour: number; perDay: number }> = {
  post:          { perMinute: 1,  perHour: 6,   perDay: 25 },
  comment_reply: { perMinute: 3,  perHour: 40,  perDay: 200 },
  like:          { perMinute: 10, perHour: 120, perDay: 600 },
  delete:        { perMinute: 5,  perHour: 60,  perDay: 300 },
};

// Duplicate-content window (same text -> silently blocked).
const DEDUPE_WINDOW_HOURS = 24;
// Same target (post/comment id) cannot receive the same action twice within…
const SAME_TARGET_WINDOW_MIN = 30;

// Quiet hours in Asia/Jerusalem (no outbound actions at night) — spam signal.
const QUIET_HOURS_START = 23; // 23:00
const QUIET_HOURS_END = 6;    // 06:00

// Banned tokens that get accounts flagged: links to competitors, spammy CTAs,
// slurs, or classic auto-reply "signatures" that Meta scores as bot behavior.
const BANNED_PATTERNS: RegExp[] = [
  /\b(viagra|cialis|casino|porn|crypto\s*airdrop|nude|xxx)\b/i,
  /(bit\.ly|tinyurl|goo\.gl|t\.co)\/[a-z0-9]+/i,           // shorteners
  /(whatsapp\s*\+?\d{6,})/i,                                // raw wa numbers
  /(follow\s*me\s*back|f4f|l4l|dm\s*for\s*promo)/i,
  /(.)\1{9,}/,                                              // 10+ repeated chars
];

// Excessive-emoji / all-caps heuristics.
function tooManyEmojis(s: string): boolean {
  const m = s.match(/[\p{Extended_Pictographic}\u{1F300}-\u{1FAFF}]/gu);
  return !!m && m.length > 8;
}
function shoutingLatin(s: string): boolean {
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length < 20) return false;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length > 0.85;
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isQuietHour(): boolean {
  const d = new Date();
  // Convert to Asia/Jerusalem hour without pulling in tz libs.
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      hour12: false,
    }).format(d),
  );
  if (QUIET_HOURS_START > QUIET_HOURS_END) {
    return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
  }
  return hour >= QUIET_HOURS_START && hour < QUIET_HOURS_END;
}

async function logAction(
  admin: any,
  row: {
    action_type: AyrActionType;
    platform?: string | null;
    target_id?: string | null;
    content_hash?: string | null;
    content_preview?: string | null;
    status: "ok" | "blocked" | "error";
    block_reason?: string | null;
  },
) {
  try {
    await admin.from("ayrshare_action_log").insert(row);
  } catch (e) {
    console.warn("[ayrshare-safety] log insert failed", e);
  }
}

async function countRecent(
  admin: any,
  actionType: AyrActionType,
  sinceIso: string,
): Promise<number> {
  const { count } = await admin
    .from("ayrshare_action_log")
    .select("id", { count: "exact", head: true })
    .eq("action_type", actionType)
    .eq("status", "ok")
    .gte("created_at", sinceIso);
  return count ?? 0;
}

/**
 * Call BEFORE hitting Ayrshare. When `allowed: false`, do NOT send the request;
 * respond gracefully to the caller. When `allowed: true`, immediately record
 * the successful action via `recordAyrshareAction` after Ayrshare acknowledges.
 */
export async function guardOutboundAction(params: {
  admin: any;
  actionType: AyrActionType;
  platform?: string;
  targetId?: string;
  content?: string;
  bypassContentChecks?: boolean; // for likes/deletes which carry no text
}): Promise<GuardResult> {
  const { admin, actionType, platform, targetId, content, bypassContentChecks } = params;
  const now = Date.now();

  // 1) Quiet hours — refuse posts & replies (never blocks likes/deletes).
  if ((actionType === "post" || actionType === "comment_reply") && isQuietHour()) {
    const reason = "quiet_hours_asia_jerusalem";
    await logAction(admin, { action_type: actionType, platform, target_id: targetId ?? null, status: "blocked", block_reason: reason, content_preview: content?.slice(0, 180) ?? null });
    return { allowed: false, reason };
  }

  // 2) Content filters.
  const text = String(content ?? "").trim();
  let hash: string | undefined;
  if (!bypassContentChecks && text) {
    if (text.length < 2) {
      return blocked("content_too_short");
    }
    if (text.length > 4500) {
      return blocked("content_too_long");
    }
    if (BANNED_PATTERNS.some((rx) => rx.test(text))) {
      return blocked("banned_pattern");
    }
    if (tooManyEmojis(text)) return blocked("excessive_emoji");
    if (shoutingLatin(text)) return blocked("all_caps");
    hash = await sha256(text.toLowerCase().replace(/\s+/g, " "));

    // Duplicate content within window?
    const sinceDup = new Date(now - DEDUPE_WINDOW_HOURS * 3600_000).toISOString();
    const { data: dup } = await admin
      .from("ayrshare_action_log")
      .select("id")
      .eq("content_hash", hash)
      .eq("status", "ok")
      .gte("created_at", sinceDup)
      .limit(1);
    if (dup && dup.length > 0) return blocked("duplicate_content");
  }

  // 3) Same-target dedupe (don't reply to / like the same id twice quickly).
  if (targetId && (actionType === "comment_reply" || actionType === "like")) {
    const sinceTgt = new Date(now - SAME_TARGET_WINDOW_MIN * 60_000).toISOString();
    const { data: tgtDup } = await admin
      .from("ayrshare_action_log")
      .select("id")
      .eq("target_id", targetId)
      .eq("action_type", actionType)
      .eq("status", "ok")
      .gte("created_at", sinceTgt)
      .limit(1);
    if (tgtDup && tgtDup.length > 0) return blocked("same_target_recent");
  }

  // 4) Rate limits.
  const lim = LIMITS[actionType];
  const [m, h, d] = await Promise.all([
    countRecent(admin, actionType, new Date(now - 60_000).toISOString()),
    countRecent(admin, actionType, new Date(now - 3600_000).toISOString()),
    countRecent(admin, actionType, new Date(now - 86400_000).toISOString()),
  ]);
  if (m >= lim.perMinute) return blocked(`rate_limit_per_minute:${m}/${lim.perMinute}`);
  if (h >= lim.perHour)   return blocked(`rate_limit_per_hour:${h}/${lim.perHour}`);
  if (d >= lim.perDay)    return blocked(`rate_limit_per_day:${d}/${lim.perDay}`);

  return { allowed: true, contentHash: hash };

  async function blocked(reason: string): Promise<GuardResult> {
    await logAction(admin, {
      action_type: actionType,
      platform: platform ?? null,
      target_id: targetId ?? null,
      content_hash: hash ?? null,
      content_preview: text ? text.slice(0, 180) : null,
      status: "blocked",
      block_reason: reason,
    });
    console.warn(`[ayrshare-safety] BLOCKED ${actionType}: ${reason}`);
    return { allowed: false, reason };
  }
}

/** Record a successful Ayrshare action so future guard calls count it. */
export async function recordAyrshareAction(
  admin: any,
  params: {
    actionType: AyrActionType;
    platform?: string;
    targetId?: string;
    content?: string;
    contentHash?: string;
  },
): Promise<void> {
  const hash = params.contentHash ??
    (params.content ? await sha256(params.content.toLowerCase().replace(/\s+/g, " ")) : null);
  await logAction(admin, {
    action_type: params.actionType,
    platform: params.platform ?? null,
    target_id: params.targetId ?? null,
    content_hash: hash,
    content_preview: params.content ? params.content.slice(0, 180) : null,
    status: "ok",
  });
}
