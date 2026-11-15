export const ROTATING_MESSAGE_AUDIENCES = ['guest', 'broker_partner', 'developer', 'private'] as const;

export type RotatingMessageAudience = typeof ROTATING_MESSAGE_AUDIENCES[number];

export interface RotatingMessage {
  id: string;
  role_key: RotatingMessageAudience;
  message_text: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
}

export const ROTATING_MESSAGE_AUDIENCE_LABELS: Record<RotatingMessageAudience, string> = {
  guest: 'אורחים',
  broker_partner: 'מתווכים ושותפים',
  developer: 'יזמים',
  private: 'משתמשים פרטיים',
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
}: {
  signedIn: boolean;
  roles: readonly string[];
  partnerMode: boolean;
}): RotatingMessageAudience {
  if (!signedIn) return 'guest';
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
