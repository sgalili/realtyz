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

/**
 * Resolve the Page identity + token for a workspace owner.
 *
 * Order: the workspace's own binding first, then the platform-shared binding
 * (`is_platform_shared = true`) so every workspace gets a working Facebook
 * connection out of the box. Env-based FB_PAGE_* fallbacks stay removed.
 */
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
  return await resolveSharedMetaPage(db);
}

/**
 * Every Page credential we may use, ordered by how likely Meta is to accept it.
 *
 * The platform-shared binding belongs to the SuperAdmin's central, App-Review
 * approved Meta application, so it is always tried as a fallback when the
 * workspace's own (possibly unreviewed) app token is rejected with a
 * permission error such as `#10 pages_read_engagement`.
 */
export async function resolveMetaPageCandidates(
  db: SupabaseClient,
  ownerId: string | null,
): Promise<Array<MetaPage & { scope: "workspace" | "platform_shared" }>> {
  const out: Array<MetaPage & { scope: "workspace" | "platform_shared" }> = [];
  const own = ownerId ? await resolveOwnMetaPage(db, ownerId) : null;
  if (own) out.push({ ...own, scope: "workspace" });
  const shared = await resolveSharedMetaPage(db);
  if (shared && !out.some((c) => c.token === shared.token)) {
    out.push({ ...shared, scope: "platform_shared" });
  }
  return out;
}

/** The workspace's own binding only (no shared fallback). */
export async function resolveOwnMetaPage(
  db: SupabaseClient,
  ownerId: string,
): Promise<MetaPage | null> {
  const { data } = await db
    .from("messenger_page_bindings")
    .select("page_id, page_name, page_access_token")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row: any = data;
  if (!row?.page_id || !row?.page_access_token) return null;
  return { pageId: String(row.page_id), pageName: row.page_name ?? null, token: String(row.page_access_token) };
}

/** True when Meta rejected the call for missing/unapproved permissions. */
export function isMetaPermissionError(payload: any): boolean {
  const err = payload?.error ?? payload ?? {};
  const code = Number(err?.code ?? 0);
  const msg = String(err?.message ?? payload ?? "");
  return code === 10 || code === 3 || code === 200 || code === 190 ||
    /pages_read_engagement|pages_show_list|permission/i.test(msg);
}

/** The platform-wide shared Page binding (used when a workspace has none). */
export async function resolveSharedMetaPage(db: SupabaseClient): Promise<MetaPage | null> {
  const { data } = await db
    .from("messenger_page_bindings")
    .select("page_id, page_name, page_access_token")
    .eq("is_platform_shared", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row: any = data;
  if (!row?.page_id || !row?.page_access_token) return null;
  return {
    pageId: String(row.page_id),
    pageName: row.page_name ?? null,
    token: String(row.page_access_token),
  };
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
