import type { Workspace } from '@/hooks/useWorkspace';

export type BrandLike = {
  agency_name?: string | null;
  logo_url?: string | null;
  landscape_logo_url?: string | null;
} | null | undefined;

export type WorkspaceIdentity = {
  /** Workspace/tenant display name — never the personal profile name. */
  name: string;
  /** Workspace/tenant logo — never the personal avatar. */
  logo: string | null;
  /** True when the resolved identity comes from a real tenant workspace. */
  isTenant: boolean;
};

const DEFAULT_NAME = 'Realtyz AI';

function norm(v?: string | null) {
  return (v ?? '').trim();
}

/**
 * Resolves the branding shown in the app shell (header + sidebar).
 *
 * Rules:
 * - A non-self (tenant) workspace ALWAYS wins: its name and logo are used and
 *   the personal profile name/avatar is never consulted.
 * - For the user's own workspace, the workspace name usually mirrors the
 *   personal full name, so it is suppressed in favour of the configured
 *   white-label agency branding, and finally the Realtyz wordmark.
 */
export function resolveWorkspaceIdentity(
  workspace: Workspace | null | undefined,
  brand?: BrandLike,
): WorkspaceIdentity {
  const wsName = norm(workspace?.workspace_name);
  const wsLogo = norm(workspace?.workspace_logo_url) || null;
  const brandName = norm(brand?.agency_name);
  // Logo precedence: the workspace's own landscape logo, then its square logo,
  // then the workspace-list logo. Never another workspace's logo.
  const brandLogo = norm(brand?.landscape_logo_url) || norm(brand?.logo_url) || null;

  const isSelf = !workspace || workspace.is_self;

  if (!isSelf) {
    return {
      name: wsName || brandName || DEFAULT_NAME,
      logo: brandLogo || wsLogo,
      isTenant: true,
    };
  }

  // Own workspace: never surface the personal profile name as branding, even
  // when the workspace name merely CONTAINS it (e.g. "Shay Galili's workspace").
  const personal = norm(workspace?.owner_full_name);
  const lc = (v: string) => v.toLowerCase();
  const nameIsPersonal =
    !!wsName && !!personal && (lc(wsName) === lc(personal) || lc(wsName).includes(lc(personal)));
  const name = (nameIsPersonal ? '' : wsName) || brandName || DEFAULT_NAME;
  const logo = brandLogo || (nameIsPersonal ? null : wsLogo);


  return { name, logo, isTenant: false };
}

export function workspaceInitial(name: string) {
  return (name || DEFAULT_NAME).trim().slice(0, 1).toUpperCase();
}
