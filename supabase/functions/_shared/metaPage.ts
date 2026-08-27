// Shared helpers for direct Meta Graph API access with a workspace Page token.
//
// The Page access token is stored server-side in public.messenger_page_bindings
// (written by meta-page-connect) and never leaves the edge runtime.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export const GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v26.0";
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type MetaPage = { pageId: string; pageName: string | null; token: string };

export function metaAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function graphCall(path: string, init?: RequestInit) {
  const res = await fetch(`${GRAPH}${path}`, init);
  const text = await res.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  return { ok: res.ok, status: res.status, payload };
}

/** Resolve the Page identity + token for a workspace owner (env fallback). */
export async function resolveMetaPage(
  db: SupabaseClient,
  ownerId: string | null,
): Promise<MetaPage | null> {
  if (ownerId) {
    const { data } = await db
      .from("messenger_page_bindings")
      .select("page_id, page_name, page_access_token")
      .eq("owner_id", ownerId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row: any = data;
    if (row?.page_id && row?.page_access_token) {
      return {
        pageId: String(row.page_id),
        pageName: row.page_name ?? null,
        token: String(row.page_access_token),
      };
    }
  }
  // TENANT ISOLATION: the platform-level FB_PAGE_* env credentials belong to a
  // single workspace and are never used as a fallback — not even for
  // owner-less/system invocations. Every Page token must come from the calling
  // workspace's own binding, so a shared Meta app can never leak posts, groups
  // or pages between accounts.
  return null;


}

/** Find the workspace owner that owns a given Meta Page id (webhook routing). */
export async function ownerForPage(db: SupabaseClient, pageId: string): Promise<MetaPage & { ownerId: string } | null> {
  const { data } = await db
    .from("messenger_page_bindings")
    .select("owner_id, page_id, page_name, page_access_token")
    .eq("page_id", pageId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row: any = data;
  if (!row?.owner_id) return null;
  return {
    ownerId: String(row.owner_id),
    pageId: String(row.page_id),
    pageName: row.page_name ?? null,
    token: String(row.page_access_token ?? ""),
  };
}

/** Short Hebrew explanation for a Graph API error body. */
export function humanizeMetaError(payload: any, fallback = "פעולה מול פייסבוק נכשלה"): string {
  const err = payload?.error ?? {};
  const code = Number(err.code ?? 0);
  const sub = Number(err.error_subcode ?? 0);
  const msg = String(err.message ?? "").trim();
  if (code === 190 || sub === 463 || sub === 467) {
    return "החיבור לעמוד הפייסבוק פג. יש לחבר מחדש את העמוד בעמוד החיבורים.";
  }
  if (code === 200 || code === 3 || code === 10) {
    return "לאפליקציה אין הרשאה לקרוא/להגיב על תגובות בעמוד הזה. יש לאשר מחדש את ההרשאות.";
  }
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return "פייסבוק הגביל את קצב הבקשות. ננסה שוב בהמשך.";
  }
  return msg || fallback;
}

/** True when the comment was authored by our own Page (never AI-answered). */
export function isOwnPageAuthor(
  fromId: string | null,
  fromName: string | null,
  page: { pageId: string; pageName: string | null },
): boolean {
  if (fromId && String(fromId) === String(page.pageId)) return true;
  const a = (fromName ?? "").trim().toLowerCase();
  const b = (page.pageName ?? "").trim().toLowerCase();
  return !!a && !!b && a === b;
}

/** Strip emoji glyphs Meta bakes into display names. */
export function cleanAuthorName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const out = raw
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return out || null;
}

export function authorAvatar(from: any): string | null {
  const direct = from?.picture?.data?.url;
  if (typeof direct === "string" && direct) return direct;
  const id = from?.id;
  return /^\d{5,}$/.test(String(id ?? "")) ? `https://graph.facebook.com/${id}/picture?type=normal` : null;
}

/**
 * Resolve the workspace owner for a request: the caller's active workspace,
 * or an explicit body.user_id for service-role / member invocations.
 */
export async function resolveTenant(
  db: SupabaseClient,
  req: Request,
  body: any,
): Promise<{ ownerId: string | null; callerId: string | null }> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  let callerId: string | null = null;
  if (token) {
    try {
      const { data } = await db.auth.getUser(token);
      callerId = data?.user?.id ?? null;
    } catch { /* service-role call */ }
  }
  let ownerId: string | null = callerId;
  if (callerId) {
    const { data: profile } = await db
      .from("profiles")
      .select("active_workspace_owner_id")
      .eq("id", callerId)
      .maybeSingle();
    ownerId = String((profile as any)?.active_workspace_owner_id || callerId);
  }
  if (!callerId && typeof body?.user_id === "string") ownerId = body.user_id;
  else if (callerId && typeof body?.user_id === "string" && body.user_id !== callerId) {
    const { data: member } = await db
      .from("workspace_memberships")
      .select("user_id")
      .eq("workspace_owner_id", body.user_id)
      .eq("user_id", callerId)
      .maybeSingle();
    if (member) ownerId = String(body.user_id);
  }
  return { ownerId, callerId };
}
