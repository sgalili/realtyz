// Shared helpers for Realtyz Ayrshare edge functions.
// Strict workspace isolation via singleton workspace_social_profile.

export const AYR_BASE = "https://api.ayrshare.com/api";
export const MISSING_TENANT_KEY = "MISSING_TENANT_KEY";
export const MISSING_TENANT_KEY_MESSAGE = "נא לחבר מחדש את פרופיל המדיה החברתית בהגדרות המשרד";

export function cleanProfileKey(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/^[`'\"]+|[`'\"]+$/g, "") : "";
}

export function isAyrshareInvalidProfileKey(status: number, payload: any): boolean {
  const code = payload?.code ?? payload?.raw?.code ?? payload?.errors?.[0]?.code;
  const message = String(payload?.message ?? payload?.error ?? payload?.raw?.message ?? payload?.errors?.[0]?.message ?? "");
  return status === 403 && (Number(code) === 144 || /profile key is invalid/i.test(message));
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
    const res = await fetch(`${AYR_BASE}/comments/like`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Profile-Key": profileKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        platforms: [platform],
        id: commentId,
        commentId,
        like: true,
        searchPlatformId: true,
      }),
    });
    const text = await res.text();
    let payload: unknown = text;
    try { payload = text ? JSON.parse(text) : null; } catch { /* keep raw */ }
    return { ok: res.ok, status: res.status, response: payload };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
