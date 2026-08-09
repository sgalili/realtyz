// Shared helpers for the "Personal Facebook Profile" integration.
//
// A workspace connects ONE personal Facebook profile through the official
// Facebook Login flow. The resulting long-lived User Access Token is stored
// server-side only (public.fb_personal_connections.access_token is not
// readable by the browser) and is used for:
//   • importing the user's groups   (GET /me/groups)
//   • publishing to a group feed    (POST /{group-id}/feed)
//
// Everything here goes through the official Graph API — no cookie replay,
// no browser automation.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export const GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v20.0";
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Scopes requested during Facebook Login for the personal profile. */
export const FB_PERSONAL_SCOPES = (
  Deno.env.get("FB_PERSONAL_SCOPES") ||
  "public_profile,user_managed_groups,groups_access_member_info,publish_to_groups"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/**
 * Resolve the caller from the Authorization bearer token and return the
 * workspace whose settings they are editing (active workspace, else self).
 */
export async function resolveCaller(
  admin: SupabaseClient,
  req: Request,
): Promise<{ userId: string; workspaceOwnerId: string } | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  const userId = data.user.id;
  const { data: profile } = await admin
    .from("profiles")
    .select("active_workspace_owner_id")
    .eq("id", userId)
    .maybeSingle();
  const ws = (profile as any)?.active_workspace_owner_id || userId;
  return { userId, workspaceOwnerId: String(ws) };
}

/** Shared Facebook OAuth app credentials (super-admin managed). */
export async function fbAppCredentials(admin: SupabaseClient): Promise<{
  clientId: string | null;
  clientSecret: string | null;
}> {
  const { data } = await admin
    .from("platform_oauth_apps")
    .select("client_id, client_secret")
    .eq("platform", "facebook")
    .maybeSingle();
  return {
    clientId: (data as any)?.client_id || Deno.env.get("FACEBOOK_APP_ID") || null,
    clientSecret:
      (data as any)?.client_secret || Deno.env.get("FACEBOOK_APP_SECRET") || null,
  };
}

/** Load the workspace's stored personal-profile token. */
export async function loadConnection(
  admin: SupabaseClient,
  workspaceOwnerId: string,
): Promise<{
  access_token: string | null;
  fb_user_id: string | null;
  fb_user_name: string | null;
  token_expires_at: string | null;
  scopes: string[];
} | null> {
  const { data } = await admin
    .from("fb_personal_connections")
    .select("access_token, fb_user_id, fb_user_name, token_expires_at, scopes")
    .eq("workspace_owner_id", workspaceOwnerId)
    .maybeSingle();
  if (!data) return null;
  return {
    access_token: (data as any).access_token ?? null,
    fb_user_id: (data as any).fb_user_id ?? null,
    fb_user_name: (data as any).fb_user_name ?? null,
    token_expires_at: (data as any).token_expires_at ?? null,
    scopes: Array.isArray((data as any).scopes) ? (data as any).scopes : [],
  };
}

/** Translate a Graph API error into a short Hebrew explanation. */
export function humanizeGraphError(body: any): string {
  const err = body?.error ?? {};
  const code = Number(err.code ?? 0);
  const sub = Number(err.error_subcode ?? 0);
  const msg = String(err.message ?? "שגיאה לא ידועה מול פייסבוק");

  if (code === 190 || sub === 463 || sub === 467) {
    return "החיבור לפרופיל הפייסבוק פג. יש להתחבר מחדש בעמוד החיבורים.";
  }
  if (code === 200 || code === 3 || code === 10) {
    return "לפייסבוק אין הרשאה לפרסם בקבוצה הזו עבור האפליקציה. יש לוודא שהאפליקציה מותקנת בקבוצה ושהיא אושרה להרשאות קבוצות.";
  }
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return "פייסבוק הגביל את קצב הבקשות. הפרסום ינסה שוב מאוחר יותר.";
  }
  if (code === 368) {
    return "פייסבוק חסם באופן זמני את הפעולה הזו על החשבון.";
  }
  return msg;
}

export async function graphGet(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH}${path}?${qs}`);
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { ok: res.ok, status: res.status, body };
}
