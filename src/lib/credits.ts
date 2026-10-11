import { Bot, Mail, MessageCircle, MessageSquare, Phone, Sparkles, type LucideIcon } from 'lucide-react';

/** Global exchange rate: 1 ILS = 25 credits (1 credit = 4 agorot). */
export const CREDITS_PER_ILS = 25;
export const AGOROT_PER_CREDIT = 100 / CREDITS_PER_ILS;

export const agorotToCredits = (agorot: number) => agorot / AGOROT_PER_CREDIT;
export const ilsToCredits = (ils: number) => ils * CREDITS_PER_ILS;
export const fmtCredits = (c: number) =>
  `${c.toLocaleString('he-IL', { maximumFractionDigits: Math.abs(c) < 1 ? 2 : 1 })} קרדיטים`;

export const ACTION_META: Record<string, { icon: LucideIcon; tone: string }> = {
  whatsapp_marketing: { icon: MessageCircle, tone: 'bg-success/15 text-success' },
  sms: { icon: MessageSquare, tone: 'bg-primary/15 text-primary' },
  email: { icon: Mail, tone: 'bg-accent text-accent-foreground' },
  ai_heavy: { icon: Sparkles, tone: 'bg-warning/15 text-warning' },
  rita_chat: { icon: Bot, tone: 'bg-secondary text-secondary-foreground' },
  ai_call_minute: { icon: Phone, tone: 'bg-destructive/15 text-destructive' },
};

/** Parses action charge notes stored as "action|quantity|label". */
export function parseActionNote(note: string | null) {
  if (!note) return null;
  const [key, qty, label] = note.split('|');
  if (!key || !ACTION_META[key]) return null;
  return { key, quantity: Number(qty) || 1, label: label || key };
}
