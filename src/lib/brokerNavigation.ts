/** The complete broker sidebar order, including fixed shell actions. */
export const BROKER_MENU_ORDER = [
  '/',
  '/properties',
  '/my-ads',
  '/command-center',
  '/inbox',
  '/campaigns',
  '/referral',
  'accessibility',
] as const;

/** Routed entries rendered between the fixed homepage and accessibility rows. */
export const BROKER_NAV_PATHS = BROKER_MENU_ORDER.filter(
  (path) => path !== '/' && path !== 'accessibility',
);
