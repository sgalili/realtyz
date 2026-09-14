/**
 * Per-workspace UI mode.
 *
 * Rita's own workspace exists only to market Realtyz to new real-estate
 * agents, so it hides deal/partner/listing surfaces and shows an
 * acquisition-focused dashboard. EVERY other workspace (standard broker
 * workspaces such as Udi Vitman's, and affiliate workspaces) gets the full
 * product: dashboard metrics, properties, deals, partners and the
 * broker/partner mode toggle.
 *
 * Never derive this from the signed-in user: it is resolved from the ACTIVE
 * workspace owner only, so switching workspaces flips the whole UI.
 */

/** Rita's marketing workspace owner id. */
export const RITA_WORKSPACE_OWNER_ID = 'dc819834-1aa9-4aca-bb27-ec2c8cebde69';

export interface WorkspaceFeatures {
  /** True only while the active workspace is Rita's marketing workspace. */
  isRitaWorkspace: boolean;
  /** Broker-recruitment mode: acquisition dashboard, bulk broker outreach. */
  recruitmentMode: boolean;
  /** Property listing management (properties pages, extraction, visibility). */
  listingsEnabled: boolean;
  /** Plan/credit/contact limits. Disabled in Rita's recruitment workspace. */
  limitsEnabled: boolean;
  /** Deal room ("עסקאות") navigation. */
  dealsEnabled: boolean;
  /** Partner network ("שותפים") navigation. */
  partnersEnabled: boolean;
  /** Broker/partner mode toggle in the sidebar. */
  modeSwitcherEnabled: boolean;
}

export function workspaceFeatures(activeOwnerId?: string | null): WorkspaceFeatures {
  const isRitaWorkspace = !!activeOwnerId && activeOwnerId === RITA_WORKSPACE_OWNER_ID;
  return {
    isRitaWorkspace,
    recruitmentMode: isRitaWorkspace,
    listingsEnabled: !isRitaWorkspace,
    limitsEnabled: !isRitaWorkspace,
    dealsEnabled: !isRitaWorkspace,
    partnersEnabled: !isRitaWorkspace,
    modeSwitcherEnabled: !isRitaWorkspace,
  };
}

/** Personal support contact for brokers joining Realtyz. */
export const SUPPORT_CONTACT = {
  name: 'ריטה',
  phone: '0537983832',
  waPhone: '972537983832',
} as const;
