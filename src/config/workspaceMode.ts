/**
 * Workspace mode: this deployment is a dedicated promotional hub for recruiting
 * real-estate agents and brokers (מתווכים) to Realtyz.
 *
 * - No contact caps, credit caps or plan restrictions (also removed in the DB).
 * - Property listing management is hidden: the app focuses on broker outreach,
 *   recruitment communication, onboarding tracking and personal support.
 */
export const BROKER_RECRUITMENT_MODE = true;

/** Listing management (properties pages, pending extraction, visibility cards). */
export const LISTINGS_ENABLED = !BROKER_RECRUITMENT_MODE;

/** All plan/credit/contact limits are disabled for this workspace. */
export const LIMITS_ENABLED = !BROKER_RECRUITMENT_MODE;

/** Personal support contact for brokers joining Realtyz. */
export const SUPPORT_CONTACT = {
  name: 'ריטה',
  phone: '0537983832',
  waPhone: '972537983832',
} as const;
