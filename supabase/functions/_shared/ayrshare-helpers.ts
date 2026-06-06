// Shared helpers for Realtyz Ayrshare edge functions.
// Strict workspace isolation via singleton workspace_social_profile.

export const AYR_BASE = "https://api.ayrshare.com/api";

export async function resolveWorkspaceProfileKey(
  admin: any,
): Promise<{ profileKey: string; refId: string | null }> {
  const { data } = await admin
    .from("workspace_social_profile")
    .select("ayrshare_profile_key, ayrshare_ref_id")
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .maybeSingle();
  return {
    profileKey: typeof data?.ayrshare_profile_key === "string" ? data.ayrshare_profile_key.trim() : "",
    refId: typeof data?.ayrshare_ref_id === "string" ? data.ayrshare_ref_id.trim() : null,
  };
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
