export const ROTATING_MESSAGE_AUDIENCES = ['guest', 'broker_partner', 'developer', 'private', 'broker_saas'] as const;

export type RotatingMessageAudience = typeof ROTATING_MESSAGE_AUDIENCES[number];

export const ROTATING_MESSAGE_ACTION_PATHS = ['/auth', '/what-is-toraff', '/faq', '/', '/my-ads', '/properties', '/campaigns', '/inbox', '/invite', '/developer-dashboard', '/wallet', '/profile'] as const;
export type RotatingMessageActionPath = typeof ROTATING_MESSAGE_ACTION_PATHS[number];

export const ROTATING_MESSAGE_ACTION_LABELS: Record<RotatingMessageActionPath, string> = {
  '/auth': 'הרשמה',
  '/what-is-toraff': 'מה זה TORAFF',
  '/faq': 'שאלות ותשובות',
  '/': 'לוח הנכסים',
  '/my-ads': 'המודעות שלי',
  '/properties': 'הנכסים שלי',
  '/campaigns': 'מרכז קמפיינים',
  '/inbox': 'שיחות ופניות',
  '/invite': 'הזמנת שותפים',
  '/developer-dashboard': 'לוח יזמים',
  '/wallet': 'ארנק',
  '/profile': 'פרופיל',
};

/** Signed-in audiences must always carry a working link. */
export function rotatingMessageRequiresLink(audience: RotatingMessageAudience): boolean {
  return audience !== 'guest';
}

export interface RotatingMessage {
  id: string;
  role_key: RotatingMessageAudience;
  message_text: string;
  action_path?: RotatingMessageActionPath | null;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
}

export const ROTATING_MESSAGE_AUDIENCE_LABELS: Record<RotatingMessageAudience, string> = {
  guest: 'אורחים',
  broker_partner: 'מתווכים ושותפים',
  developer: 'יזמים',
  private: 'משתמשים פרטיים',
  broker_saas: 'מתווכים (מצב מתווכים בלבד)',
};

const BROKER_ROLES = new Set([
  'admin',
  'moderator',
  'super_admin',
  'managing_broker',
  'lead_agent',
  'agent',
  'assistant',
  'junior_agent',
]);

export function resolveRotatingMessageAudience({
  signedIn,
  roles,
  partnerMode,
  brokersOnly = false,
}: {
  signedIn: boolean;
  roles: readonly string[];
  partnerMode: boolean;
  brokersOnly?: boolean;
}): RotatingMessageAudience {
  if (!signedIn) return 'guest';
  if (brokersOnly && roles.some((role) => BROKER_ROLES.has(role))) return 'broker_saas';
  if (partnerMode) return 'broker_partner';
  if (roles.includes('developer')) return 'developer';
  if (roles.includes('affiliate') || roles.some((role) => BROKER_ROLES.has(role))) return 'broker_partner';
  return 'private';
}

export function cleanRotatingMessageText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function validRotatingMessageText(value: string): boolean {
  const length = cleanRotatingMessageText(value).length;
  return length >= 1 && length <= 240;
}

export function rotatingMessageNavigation(value: unknown): {
  path: RotatingMessageActionPath;
  state?: { signup: true; tab: 'signup' };
} | null {
  if (!ROTATING_MESSAGE_ACTION_PATHS.includes(value as RotatingMessageActionPath)) return null;
  const path = value as RotatingMessageActionPath;
  return path === '/auth' ? { path, state: { signup: true, tab: 'signup' } } : { path };
}
