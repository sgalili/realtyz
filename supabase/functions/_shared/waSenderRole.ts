// waSenderRole
// ────────────
// Identifies whether an inbound WhatsApp sender is an INTERNAL staff member
// (workspace owner / admin / manager / agent) rather than a visitor or lead.
//
// Every workspace shares the same official Meta WhatsApp number, so the only
// reliable signal is the sender's own phone. Resolution order:
//   1. kb_whitelist  → explicit owner-companion phone (highest trust).
//   2. profiles.phone → platform user, then their role from `user_roles`
//      and their membership role from `workspace_memberships`.
//
// The result is injected into the AI system prompt so Rita treats a manager as
// an internal administrator (setup / dashboard / management support) and never
// pitches a demo to them.

import { waPhoneVariants } from "./waContextRouter.ts";

type MinimalClient = { from: (t: string) => any };

export type WaSenderRoleKind = "owner" | "admin" | "manager" | "agent" | "visitor";

export interface WaSenderRole {
  /** Platform user id when the sender is a known internal user. */
  userId: string | null;
  /** Workspace this staff member operates in. */
  workspaceOwnerId: string | null;
  kind: WaSenderRoleKind;
  /** True for owner / admin / manager / agent. */
  isStaff: boolean;
  displayName: string | null;
  /** Human-readable label for logs and prompt injection. */
  label: string;
  reason: string;
}

const VISITOR: WaSenderRole = {
  userId: null,
  workspaceOwnerId: null,
  kind: "visitor",
  isStaff: false,
  displayName: null,
  label: "Visitor/Lead",
  reason: "no_internal_match",
};

const ADMIN_ROLES = new Set(["super_admin", "admin"]);
const MANAGER_ROLES = new Set(["moderator", "managing_broker", "lead_agent"]);
const AGENT_ROLES = new Set(["agent", "assistant", "junior_agent"]);

function labelFor(kind: WaSenderRoleKind): string {
  switch (kind) {
    case "owner": return "Owner";
    case "admin": return "Admin";
    case "manager": return "Manager";
    case "agent": return "Agent (internal team member)";
    default: return "Visitor/Lead";
  }
}

function build(
  kind: WaSenderRoleKind,
  reason: string,
  userId: string | null,
  workspaceOwnerId: string | null,
  displayName: string | null,
): WaSenderRole {
  return {
    userId,
    workspaceOwnerId,
    kind,
    isStaff: kind !== "visitor",
    displayName,
    label: labelFor(kind),
    reason,
  };
}

export async function resolveWaSenderRole(
  admin: MinimalClient,
  rawPhone: string,
): Promise<WaSenderRole> {
  const variants = waPhoneVariants(rawPhone);
  if (!variants.length) return VISITOR;

  // 1. Explicit owner-companion whitelist.
  let whitelistUserId: string | null = null;
  let whitelistLabel: string | null = null;
  try {
    const { data } = await admin
      .from("kb_whitelist")
      .select("user_id, label, phone_number")
      .in("phone_number", variants)
      .limit(1)
      .maybeSingle();
    whitelistUserId = (data?.user_id as string | undefined) ?? null;
    whitelistLabel = (data?.label as string | undefined) ?? null;
  } catch (e) {
    console.warn("[waSenderRole] kb_whitelist lookup threw", e instanceof Error ? e.message : e);
  }

  // 2. Platform user by phone.
  let profile: { id: string; full_name: string | null; active_workspace_owner_id: string | null } | null = null;
  try {
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, active_workspace_owner_id, phone")
      .in("phone", variants)
      .limit(1)
      .maybeSingle();
    if (data?.id) {
      profile = {
        id: String(data.id),
        full_name: (data.full_name as string | null) ?? null,
        active_workspace_owner_id: (data.active_workspace_owner_id as string | null) ?? null,
      };
    }
  } catch (e) {
    console.warn("[waSenderRole] profile lookup threw", e instanceof Error ? e.message : e);
  }

  const userId = profile?.id ?? whitelistUserId;
  if (!userId) return VISITOR;

  let displayName = profile?.full_name ?? whitelistLabel ?? null;
  let workspaceOwnerId = profile?.active_workspace_owner_id ?? userId;

  // Platform roles.
  let roles: string[] = [];
  try {
    const { data } = await admin.from("user_roles").select("role").eq("user_id", userId);
    roles = ((data ?? []) as Array<{ role: string | null }>)
      .map((r) => String(r.role ?? "").trim())
      .filter(Boolean);
  } catch (e) {
    console.warn("[waSenderRole] user_roles lookup threw", e instanceof Error ? e.message : e);
  }

  // Workspace membership role (owner / admin / manager / member).
  let membershipRole = "";
  try {
    const { data } = await admin
      .from("workspace_memberships")
      .select("role, workspace_owner_id, workspace_name")
      .eq("user_id", userId)
      .order("last_accessed_at", { ascending: false })
      .limit(5);
    const rows = (data ?? []) as Array<{ role: string | null; workspace_owner_id: string | null }>;
    const preferred =
      rows.find((r) => r.workspace_owner_id && r.workspace_owner_id === workspaceOwnerId) ?? rows[0];
    if (preferred) {
      membershipRole = String(preferred.role ?? "").trim().toLowerCase();
      if (preferred.workspace_owner_id) workspaceOwnerId = preferred.workspace_owner_id;
    }
  } catch (e) {
    console.warn("[waSenderRole] workspace_memberships lookup threw", e instanceof Error ? e.message : e);
  }

  if (!displayName && whitelistLabel) displayName = whitelistLabel;

  // Owner of their own workspace, or explicitly whitelisted as the companion.
  if (membershipRole === "owner" || workspaceOwnerId === userId || whitelistUserId === userId) {
    return build("owner", "workspace_owner", userId, workspaceOwnerId, displayName);
  }
  if (membershipRole === "admin" || roles.some((r) => ADMIN_ROLES.has(r))) {
    return build("admin", "platform_admin", userId, workspaceOwnerId, displayName);
  }
  if (membershipRole === "manager" || roles.some((r) => MANAGER_ROLES.has(r))) {
    return build("manager", "workspace_manager", userId, workspaceOwnerId, displayName);
  }
  if (roles.some((r) => AGENT_ROLES.has(r)) || membershipRole === "member") {
    return build("agent", "workspace_team_member", userId, workspaceOwnerId, displayName);
  }
  return VISITOR;
}
