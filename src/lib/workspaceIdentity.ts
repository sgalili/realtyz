import type { Workspace } from '@/hooks/useWorkspace';
import { isSyntheticEmail } from '@/lib/friendlyUserDisplayName';
import { formatPhoneDisplay } from '@/lib/formatPhone';

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

const DEFAULT_NAME = 'TORAFF';

function norm(v?: string | null) {
  const value = (v ?? '').trim();
  return isSyntheticEmail(value) ? '' : value;
}

/**
 * Resolves the branding shown in the app shell (header + sidebar).
 *
 * Rules:
 * - A non-self (tenant) workspace ALWAYS wins: its name and logo are used and
 *   the personal profile name/avatar is never consulted.
 * - For the user's own workspace, the workspace name usually mirrors the
 *   personal full name, so it is suppressed in favour of the configured
 *   white-label agency branding, and finally the TORAFF wordmark.
 */
/**
 * A personal profile picture is NEVER office branding. Anything served from the
 * personal avatar bucket (or equal to the owner's avatar) is rejected outright,
 * so a stale cached value can't leak a headshot into the header.
 */
function officeLogoOnly(url: string | null, ownerAvatar: string): string | null {
  if (!url) return null;
  if (/\/(?:avatars|profile-photos)\//i.test(url)) return null;
  if (ownerAvatar && url === ownerAvatar) return null;
  return url;
}

export function resolveWorkspaceIdentity(
  workspace: Workspace | null | undefined,
  brand?: BrandLike,
  master?: BrandLike,
): WorkspaceIdentity {
  const wsName = norm(workspace?.workspace_name);
  const ownerAvatar = norm(workspace?.owner_avatar_url);
  const wsLogo = officeLogoOnly(norm(workspace?.workspace_logo_url) || null, ownerAvatar);
  const brandName = norm(brand?.agency_name);
  const defaultName = norm(master?.agency_name) || DEFAULT_NAME;
  const defaultLogo = officeLogoOnly(norm(master?.landscape_logo_url) || norm(master?.logo_url) || null, ownerAvatar);
  // Logo precedence: the workspace's own landscape logo, then its square logo,
  // then the workspace-list logo. Never another workspace's logo, and never a
  // personal profile picture.
  const brandLogo = officeLogoOnly(
    norm(brand?.landscape_logo_url) || norm(brand?.logo_url) || null,
    ownerAvatar,
  );

  const isSelf = !workspace || workspace.is_self;

  if (!isSelf) {
    return {
      name: brandName || wsName || defaultName,
      logo: brandLogo || wsLogo || defaultLogo,
      isTenant: true,
    };
  }

  // Own workspace: never surface the personal profile name as branding, even
  // when the workspace name merely CONTAINS it (e.g. "Shay Galili's workspace").
  const personal = norm(workspace?.owner_full_name);
  const lc = (v: string) => v.toLowerCase();
  const nameIsPersonal =
    !!wsName && !!personal && (lc(wsName) === lc(personal) || lc(wsName).includes(lc(personal)));
  const name = brandName || (nameIsPersonal ? '' : wsName) || defaultName;
  const logo = brandLogo || (nameIsPersonal ? null : wsLogo) || defaultLogo;


  return { name, logo, isTenant: false };
}


export function workspaceInitial(name: string) {
  return (name || DEFAULT_NAME).trim().slice(0, 1).toUpperCase();
}

export type WorkspaceCardImage = {
  url: string | null;
  /** True when the image is the owner's personal profile picture. */
  isAvatar: boolean;
};

/**
 * Account-card image rules (workspace switcher + picker):
 * - A private person (property owner / buyer / renter / partner-only) always
 *   shows their personal profile picture.
 * - A company/office shows its square logo, then the rectangular (landscape)
 *   logo, and only then the owner's personal profile picture.
 */
export function resolveWorkspaceCardImage(
  workspace: Workspace | null | undefined,
  brand?: BrandLike,
): WorkspaceCardImage {
  const avatar = norm(workspace?.owner_avatar_url) || null;
  const brandName = norm(brand?.agency_name);
  const isOffice = workspace?.is_office ?? (!!brandName && brandName !== DEFAULT_NAME);
  if (!isOffice) return { url: avatar, isAvatar: true };
  const square = officeLogoOnly(norm(workspace?.workspace_logo_square_url) || null, avatar ?? '');
  const landscape = officeLogoOnly(norm(workspace?.workspace_logo_landscape_url) || null, avatar ?? '');
  const merged = officeLogoOnly(norm(workspace?.workspace_logo_url) || null, avatar ?? '');
  const logo = square || landscape || merged;
  if (logo) return { url: logo, isAvatar: false };
  return { url: avatar, isAvatar: true };
}

export type WorkspaceCardIdentity = {
  /** First line: the office/company name, or the person's full name. */
  title: string;
  /** Second line: the owner's mobile, or their name under an office title. */
  subtitle: string;
  logo: string | null;
  isOffice: boolean;
  isTenant: boolean;
};

/**
 * Resolves the two lines of a workspace ACCOUNT card (the sidebar switcher and
 * the workspace picker). This is deliberately NOT shell branding: a person who
 * works alone must be named on the first line with their mobile underneath,
 * while a real office/company/office keeps its own name on top.
 */
export function resolveWorkspaceCardIdentity(
  workspace: Workspace | null | undefined,
  brand?: BrandLike,
  master?: BrandLike,
): WorkspaceCardIdentity {
  const identity = resolveWorkspaceIdentity(workspace, brand, master);
  const person = norm(workspace?.owner_full_name);
  const email = norm(workspace?.owner_email);
  const phoneLine = (workspace?.owner_phone ?? '').trim() ? formatPhoneDisplay(workspace!.owner_phone!) : '';
  const brandName = norm(brand?.agency_name);
  // The workspace list decides this server-side; a stale local cache that
  // predates the field falls back to "does this workspace carry a brand name".
  const isOffice = workspace?.is_office ?? (!!brandName && brandName !== DEFAULT_NAME);

  if (isOffice) {
    return {
      title: identity.name,
      subtitle: person || phoneLine || email,
      logo: identity.logo,
      isOffice: true,
      isTenant: identity.isTenant,
    };
  }

  return {
    title: person || identity.name,
    subtitle: phoneLine || (email && email !== person ? email : ''),
    logo: identity.logo,
    isOffice: false,
    isTenant: identity.isTenant,
  };
}
