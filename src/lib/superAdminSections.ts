import { Activity, Bot, MessageSquareText, PlugZap, QrCode, ScanSearch, ServerCog, Trash2, UserPlus, Users, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type AdminSection =
  | 'users'
  | 'messages'
  | 'rita-chats'
  | 'qr'
  | 'import'
  | 'deletion'
  | 'finance'
  | 'payments'
  | 'activity'
  | 'scraping'
  | 'connections'
  | 'system';

export interface AdminSectionOption {
  value: AdminSection;
  label: string;
  icon: LucideIcon;
}

// The hero dropdown is the only Super Admin navigation, so every section the
// page can render has to appear here.
export const ADMIN_SECTIONS: readonly AdminSectionOption[] = [
  { value: 'users', label: 'ניהול משתמשים', icon: Users },
  { value: 'messages', label: 'ניהול מסרים מתחלפים', icon: MessageSquareText },
  { value: 'rita-chats', label: "צ'אטים עם ריטה", icon: Bot },
  { value: 'qr', label: 'ניהול QR דינמי', icon: QrCode },
  { value: 'import', label: 'ייבוא מתווכים ויזמים', icon: UserPlus },
  { value: 'deletion', label: 'מחיקה וארכיון', icon: Trash2 },
  { value: 'finance', label: 'פיננסי', icon: Wallet },
  { value: 'payments', label: 'הגדרות תשלום', icon: Wallet },
  { value: 'activity', label: 'פעילות וניטור', icon: Activity },
  { value: 'scraping', label: 'שימוש Bright Data', icon: ScanSearch },
  { value: 'connections', label: 'חיבורים', icon: PlugZap },
  { value: 'system', label: 'שגיאות ומערכת', icon: ServerCog },
];

export const DEFAULT_ADMIN_SECTION: AdminSection = 'users';

// The hero dropdown writes ?section=..., so any value that is not a known
// section (typo, stale bookmark) has to fall back to user management.
export const resolveAdminSection = (value: string | null | undefined): AdminSection =>
  ADMIN_SECTIONS.some((section) => section.value === value) ? (value as AdminSection) : DEFAULT_ADMIN_SECTION;

export const adminSectionLabel = (value: AdminSection, openConnectionAlerts = 0) => {
  const option = ADMIN_SECTIONS.find((section) => section.value === value);
  if (!option) return value;
  if (value === 'connections' && openConnectionAlerts > 0) return `${option.label} (${openConnectionAlerts})`;
  return option.label;
};
