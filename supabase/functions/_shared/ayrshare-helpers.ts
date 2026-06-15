// Shared helpers for Realtyz Ayrshare edge functions.
// Strict workspace isolation via singleton workspace_social_profile.

export const AYR_BASE = "https://api.ayrshare.com/api";
export const MISSING_TENANT_KEY = "MISSING_TENANT_KEY";
export const MISSING_TENANT_KEY_MESSAGE = "נא לחבר מחדש את פרופיל המדיה החברתית בהגדרות המשרד";
const ACTIVE_WORKSPACE_REF_ID = "66743d525e0cd68404f38e954f3d016ee1a509c4";

export function cleanProfileKey(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/^[`'\"]+|[`'\"]+$/g, "") : "";
}

export function isAyrshareInvalidProfileKey(status: number, payload: any): boolean {
  const code = payload?.code ?? payload?.raw?.code ?? payload?.errors?.[0]?.code;
  const message = String(payload?.message ?? payload?.error ?? payload?.raw?.message ?? payload?.errors?.[0]?.message ?? "");
  // Self-heal on ANY 401 (unauthorized) or 403 (suspended/forbidden) — auto-clear
  // the stale workspace profile so the UI immediately flips to a disconnected
  // state instead of looping on a zombie connection.
  if (status === 401) return true;
  if (status === 403) {
    if (Number(code) === 144 || Number(code) === 276) return true;
    if (/profile key is invalid|account has been suspended|unauthor|forbidden|suspended/i.test(message)) return true;
    return true; // any 403 from Ayrshare → treat as invalid profile and self-heal
  }
  return false;
}

export async function clearStaleAyrshareConnection(admin: any, reason = "stale_ayrshare_profile") {
  const now = new Date().toISOString();
  await admin
    .from("workspace_social_profile")
    .update({
      ayrshare_profile_key: null,
      ayrshare_ref_id: null,
      facebook_page_id: null,
      facebook_page_name: null,
      updated_at: now,
    })
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .neq("ayrshare_ref_id", ACTIVE_WORKSPACE_REF_ID);
  await admin
    .from("ayrshare_social_accounts")
    .update({ connected: false, is_active: false, updated_at: now })
    .eq("platform", "facebook");
  await admin
    .from("social_connections")
    .update({
      is_connected: false,
      last_test_status: "failed",
      last_test_message: reason,
      updated_at: now,
    })
    .ilike("platform", "facebook%");
}

export async function verifyWorkspaceProfileKey(params: {
  apiKey: string;
  profileKey: string;
}): Promise<{ ok: boolean; missingTenantKey: boolean; status?: number; payload?: any }> {
  const profileKey = cleanProfileKey(params.profileKey);
  if (!profileKey) return { ok: false, missingTenantKey: true };
  try {
    const res = await fetch(`${AYR_BASE}/user`, {
      headers: { Authorization: `Bearer ${params.apiKey}`, "Profile-Key": profileKey },
    });
    const text = await res.text();
    let payload: any = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { rawText: text }; }
    return {
      ok: res.ok,
      missingTenantKey: isAyrshareInvalidProfileKey(res.status, payload),
      status: res.status,
      payload,
    };
  } catch (e) {
    return { ok: false, missingTenantKey: false, payload: { message: e instanceof Error ? e.message : String(e) } };
  }
}

export async function resolveWorkspaceProfileKey(
  admin: any,
): Promise<{ profileKey: string; refId: string | null }> {
  const { data } = await admin
    .from("workspace_social_profile")
    .select("ayrshare_profile_key, ayrshare_ref_id")
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .maybeSingle();
  return {
    profileKey: cleanProfileKey(data?.ayrshare_profile_key),
    refId: cleanProfileKey(data?.ayrshare_ref_id) || null,
  };
}

// Resolve the workspace's own Facebook Page identity so downstream functions
// can refuse to react to comments authored by ourselves (anti self-reply loop).
export async function resolveOwnPageIdentity(
  admin: any,
): Promise<{ pageId: string | null; pageName: string | null }> {
  const { data } = await admin
    .from("workspace_social_profile")
    .select("facebook_page_id, facebook_page_name")
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .maybeSingle();
  return {
    pageId: typeof data?.facebook_page_id === "string" ? data.facebook_page_id.trim() : null,
    pageName: typeof data?.facebook_page_name === "string" ? data.facebook_page_name.trim() : null,
  };
}

// True when the inbound comment was authored by our own connected Page,
// by Ayrshare on our behalf, or carries our system reply signature.
export function isSelfAuthoredComment(args: {
  fromId?: string | null;
  fromName?: string | null;
  text?: string | null;
  ownPageId?: string | null;
  ownPageName?: string | null;
}): boolean {
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
  const fromId = norm(args.fromId);
  const fromName = norm(args.fromName);
  const ownId = norm(args.ownPageId);
  const ownName = norm(args.ownPageName);
  if (ownId && fromId && fromId === ownId) return true;
  if (ownName && fromName && fromName === ownName) return true;
  // Common Ayrshare/Realtyz reply signature fragments (Hebrew) that should never
  // bounce back into our own ingestion pipeline.
  const t = String(args.text ?? "").toLowerCase();
  const signatures = [
    "אני מודה לך אודי ויטמן",
    "תודה רבה על העדכון",
    "[ai realtyz]",
  ];
  if (t && signatures.some((s) => t.includes(s))) return true;
  return false;
}

export function sanitizeOutboundText(input: string): string {
  let out = String(input ?? "");
  // Strip em/en dash, double-dash, asterisks, common emoji ranges
  out = out
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/gu, "")
    .replace(/[—–]+/g, " ")
    .replace(/\*+/g, "")
    .replace(/-{2,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return out;
}

/**
 * Strip markdown emphasis (** bold **, * italics *, __ underline __, _ italics _,
 * ` code `, # headers) from generated text. Use for any AI text that lands in
 * social posts, social comments/replies, email, SMS, or any non-WhatsApp surface.
 * NEVER apply this to WhatsApp Green API output — WA renders `*bold*` natively.
 */
export function stripMarkdownEmphasis(input: string): string {
  let out = String(input ?? "");
  // Bold: **text** or __text__  →  text
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, "$1").replace(/__([^_\n]+?)__/g, "$1");
  // Italics: *text* or _text_  →  text  (avoid touching lone * already gone)
  out = out.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1$2");
  out = out.replace(/(^|[^_])_([^_\n]+?)_(?!_)/g, "$1$2");
  // Any leftover stray asterisks/underscores from partial markdown
  out = out.replace(/\*+/g, "").replace(/(^|\s)_+|_+(?=\s|$)/g, "$1");
  // Inline code `x` and leading # headers
  out = out.replace(/`+([^`\n]+?)`+/g, "$1").replace(/^\s{0,3}#{1,6}\s+/gm, "");
  return out.replace(/[ \t]{2,}/g, " ").trim();
}


export function detectDominantLanguage(text: string): "he" | "en" | "other" {
  const s = String(text || "");
  const hebrew = (s.match(/[\u0590-\u05FF]/g) ?? []).length;
  const english = (s.match(/[A-Za-z]/g) ?? []).length;
  if (english > hebrew && english >= 3) return "en";
  if (hebrew > english && hebrew >= 2) return "he";
  return "other";
}

// Fire-and-forget Auto-Like for an inbound comment. Targets the user's native
// comment via Ayrshare so the workspace's connected page reacts with a Like,
// boosting algorithmic reach. Never throws — caller uses Promise.all safely.
export async function likeNativeComment(params: {
  apiKey: string;
  profileKey: string;
  platform: string;
  commentId: string;
}): Promise<{ ok: boolean; status?: number; response?: unknown; error?: string }> {
  const { apiKey, profileKey, platform, commentId } = params;
  if (!apiKey || !profileKey || !commentId) {
    return { ok: false, error: "missing_params" };
  }
  try {
    // Ayrshare current contract for liking a native comment:
    //   POST /api/comments  { platforms, id, action: "like", searchPlatformId: true }
    // (the legacy /api/comments/like endpoint was removed and now 404s).
    const tryRequest = async (url: string, body: Record<string, unknown>) => {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Profile-Key": profileKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const t = await r.text();
      let p: unknown = t;
      try { p = t ? JSON.parse(t) : null; } catch { /* keep raw */ }
      return { ok: r.ok, status: r.status, response: p };
    };

    let result = await tryRequest(`${AYR_BASE}/comments`, {
      platforms: [platform],
      id: commentId,
      action: "like",
      searchPlatformId: true,
    });
    if (!result.ok && result.status === 404) {
      // Fallback: per-id path variant.
      result = await tryRequest(`${AYR_BASE}/comments/${encodeURIComponent(commentId)}`, {
        action: "like",
        platforms: [platform],
        searchPlatformId: true,
      });
    }
    return result;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
