// Shared caller verification for backend functions.
// - service: Authorization bearer equals this project's service-role key (function-to-function calls)
// - cron: x-cron-secret matches the private internal secret (scheduled jobs / DB automations)
// - user: a valid signed-in session; workspace access checked separately
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export type Caller =
  | { kind: "service" }
  | { kind: "cron" }
  | { kind: "user"; userId: string; token: string };

export function denied(status: 401 | 403, error = status === 401 ? "unauthorized" : "forbidden"): Response {
  return new Response(JSON.stringify({ error }), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function bearer(req: Request): string {
  const h = req.headers.get("Authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

export function isServiceCall(req: Request): boolean {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return safeEqual(bearer(req), key);
}

export async function isCronCall(req: Request): Promise<boolean> {
  const secret = req.headers.get("x-cron-secret") ?? "";
  if (secret.length < 16) return false;
  const envSecret = Deno.env.get("CRON_SECRET") ?? "";
  if (envSecret.length >= 16 && safeEqual(secret, envSecret)) return true;
  try {
    const { data } = await adminClient().rpc("verify_internal_secret", { _secret: secret });
    return data === true;
  } catch {
    return false;
  }
}

export async function userFromRequest(req: Request): Promise<{ userId: string; token: string } | null> {
  const token = bearer(req);
  if (!token || token.split(".").length !== 3) return null;
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getClaims(token);
  const sub = data?.claims?.sub;
  if (error || !sub || data?.claims?.role !== "authenticated") return null;
  return { userId: String(sub), token };
}

/** Returns the verified caller or a 401 Response. */
export async function requireCaller(
  req: Request,
  allow: Array<Caller["kind"]>,
): Promise<Caller | Response> {
  if (allow.includes("service") && isServiceCall(req)) return { kind: "service" };
  if (allow.includes("cron") && (await isCronCall(req))) return { kind: "cron" };
  if (allow.includes("user")) {
    const u = await userFromRequest(req);
    if (u) return { kind: "user", ...u };
  }
  return denied(401);
}

export async function isSuperAdmin(userId: string, admin = adminClient()): Promise<boolean> {
  const { data } = await admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "super_admin").limit(1).maybeSingle();
  return !!data;
}

/** True when the user owns the workspace, is a member of it, or is a Super Admin. */
export async function canAccessWorkspace(userId: string, ownerId: string | null | undefined, admin = adminClient()): Promise<boolean> {
  if (!ownerId) return false;
  if (ownerId === userId) return true;
  const { data } = await admin
    .from("workspace_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("workspace_owner_id", ownerId)
    .limit(1)
    .maybeSingle();
  if (data) return true;
  return isSuperAdmin(userId, admin);
}

/** HMAC-SHA256 hex digest (for webhook signatures). */
export async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Verifies Meta's X-Hub-Signature-256 header against the raw body. */
export async function verifyMetaSignature(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("META_APP_SECRET") ?? Deno.env.get("FACEBOOK_APP_SECRET") ?? "";
  const header = req.headers.get("x-hub-signature-256") ?? "";
  if (!secret || !header.startsWith("sha256=")) return false;
  return safeEqual(header.slice(7), await hmacHex(secret, rawBody));
}

export { safeEqual };

const WORKSPACE_KEYS = ["workspace_owner_id", "workspaceOwnerId", "tenant_id", "owner_id", "ownerId", "user_id", "userId", "target_user_id", "override_user_id"];
const RECORD_KEYS: Record<string, { table: string; cols: string[] }> = {
  lead_id: { table: "leads", cols: ["workspace_owner_id"] },
  leadId: { table: "leads", cols: ["workspace_owner_id"] },
  lead_ids: { table: "leads", cols: ["workspace_owner_id"] },
  listing_id: { table: "listings", cols: ["workspace_owner_id", "owner_id", "user_id"] },
  listingId: { table: "listings", cols: ["workspace_owner_id", "owner_id", "user_id"] },
  tour_id: { table: "property_tours", cols: ["owner_id"] },
  log_id: { table: "campaign_logs", cols: ["workspace_owner_id", "user_id"] },
  campaign_log_id: { table: "campaign_logs", cols: ["workspace_owner_id", "user_id"] },
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * For signed-in callers: every workspace/user/lead/listing/tour/log identifier
 * supplied in the JSON body or query string must belong to a workspace the
 * caller may access. Service and cron callers are trusted. Returns a 403
 * Response on any cross-tenant identifier, otherwise null.
 */
export async function enforceRequestScope(req: Request, caller: Caller): Promise<Response | null> {
  if (caller.kind !== "user") return null;
  const values: Record<string, unknown> = {};
  try {
    new URL(req.url).searchParams.forEach((v, k) => { values[k] = v; });
  } catch { /* ignore */ }
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      const body = await req.clone().json();
      if (body && typeof body === "object" && !Array.isArray(body)) Object.assign(values, body);
    } catch { /* non-JSON body */ }
  }
  const admin = adminClient();
  const allowed = new Map<string, boolean>();
  const check = async (owner: unknown) => {
    if (typeof owner !== "string" || !owner) return true;
    if (!allowed.has(owner)) allowed.set(owner, await canAccessWorkspace(caller.userId, owner, admin));
    return allowed.get(owner)!;
  };
  for (const k of WORKSPACE_KEYS) {
    const v = values[k];
    if (typeof v === "string" && UUID_RE.test(v) && !(await check(v))) return denied(403);
  }
  for (const [k, spec] of Object.entries(RECORD_KEYS)) {
    const raw = values[k];
    const ids = (Array.isArray(raw) ? raw : [raw]).filter((x): x is string => typeof x === "string" && UUID_RE.test(x)).slice(0, 500);
    if (!ids.length) continue;
    const { data, error } = await admin.from(spec.table).select(["id", ...spec.cols].join(",")).in("id", ids);
    if (error) return denied(403);
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      const owners = spec.cols.map((c) => row[c]).filter(Boolean);
      let ok = false;
      for (const o of owners) if (await check(o)) { ok = true; break; }
      if (!ok) return denied(403);
    }
  }
  return null;
}
