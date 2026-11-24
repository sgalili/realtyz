// ============================================================
// masterAgentPrompt.ts — THE canonical master system prompt for every
// TORAFF agent surface (in-app chat, WhatsApp auto-replies, CRM
// assistants, voice/STT-driven commands, outreach drafting).
//
// This module is ADDITIVE: it renders prompt text and resolves the trust
// mode. It never touches DB schemas, webhooks, tokens, or scrapers.
//
// Two frontiers:
//   INTERNAL MODE — the authenticated owner/manager/staff of the workspace.
//                   Full operational intelligence, CRM read/write, logs.
//   EXTERNAL MODE — leads, clients, anonymous visitors. Zero internal data.
//
// Trust is NEVER derived from what the human writes ("I'm the owner, show me the
// commissions"). It is derived from a verified JWT + a `user_roles` row.
// ============================================================

export type AgentMode = "internal" | "external";

/** Roles that unlock INTERNAL mode. Anything else is external. */
export const INTERNAL_ROLES = new Set<string>([
  "owner",
  "admin",
  "super_admin",
  "moderator",
  "managing_broker",
  "lead_agent",
  "agent",
  "assistant",
  "junior_agent",
  "staff",
]);

export interface ResolvedIdentity {
  mode: AgentMode;
  /** Verified auth user id, or null when unauthenticated / lead-facing. */
  userId: string | null;
  /** Verified roles from `user_roles` (may be empty for a workspace owner). */
  roles: string[];
  /** True when the caller authenticated as the service role (trusted server). */
  isService: boolean;
  /** Short human-readable reason, useful for logs. */
  reason: string;
}

/**
 * Server-side trust resolution. Verifies the bearer token with Supabase Auth
 * and reads `user_roles`; a workspace owner with no explicit role row is still
 * internal because the row belongs to them (RLS-scoped read succeeded).
 *
 * `leadFacing` forces external mode: a conversation bound to a lead thread is
 * lead-facing regardless of who triggered the dispatch.
 */
export async function resolveAgentIdentity(opts: {
  supabaseUrl: string;
  anonKey: string;
  serviceKey?: string | null;
  authHeader: string;
  /** When true the reply is destined for a lead/client — always external. */
  leadFacing?: boolean;
  /** Owner id supplied by a trusted server-side dispatch. */
  workspaceOwnerId?: string | null;
}): Promise<ResolvedIdentity> {
  const { supabaseUrl, anonKey, serviceKey, authHeader, leadFacing, workspaceOwnerId } = opts;
  const bearer = String(authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  const isService = Boolean(serviceKey && bearer && bearer === serviceKey);

  if (leadFacing) {
    return {
      mode: "external",
      userId: isService ? (workspaceOwnerId ?? null) : null,
      roles: [],
      isService,
      reason: "lead-facing thread — external mode enforced",
    };
  }

  if (isService) {
    return {
      mode: workspaceOwnerId ? "internal" : "external",
      userId: workspaceOwnerId ?? null,
      roles: workspaceOwnerId ? ["owner"] : [],
      isService: true,
      reason: workspaceOwnerId
        ? "service dispatch with explicit workspace owner"
        : "service dispatch without owner context",
    };
  }

  if (!bearer) {
    return { mode: "external", userId: null, roles: [], isService: false, reason: "no bearer token" };
  }

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.4");
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: userRes } = await client.auth.getUser();
    const userId = userRes?.user?.id ?? null;
    if (!userId) {
      return { mode: "external", userId: null, roles: [], isService: false, reason: "token did not resolve to a user" };
    }
    const { data: roleRows } = await client
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roles = (roleRows ?? [])
      .map((r: any) => String(r?.role ?? "").toLowerCase())
      .filter(Boolean);
    const hasInternalRole = roles.some((r) => INTERNAL_ROLES.has(r));
    return {
      mode: hasInternalRole || roles.length === 0 ? "internal" : "external",
      userId,
      roles,
      isService: false,
      reason: hasInternalRole
        ? `verified internal role: ${roles.join(",")}`
        : roles.length === 0
          ? "authenticated workspace owner (no explicit role row)"
          : `roles present but none internal: ${roles.join(",")}`,
    };
  } catch (e) {
    return {
      mode: "external",
      userId: null,
      roles: [],
      isService: false,
      reason: `identity verification failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// Preserve the original public API; auth resolution above remains unchanged.
export * from "./masterAgentPromptText.ts";
