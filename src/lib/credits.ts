import { Bot, Mail, MessageCircle, MessageSquare, Phone, Sparkles, type LucideIcon } from 'lucide-react';

/**
 * Single source of truth for credit ⇄ ILS conversion.
 * The rate is configured by Super Admin (credit_conversion_settings) and loaded once by CreditRateSync.
 * 4 (1 credit = ₪0.25) is only the fallback until the configured rate loads.
 */
export const DEFAULT_CREDITS_PER_ILS = 4;
const RATE_KEY = 'toraff-credits-per-ils-v2';
const readCachedRate = () => {
  try { const v = Number(globalThis.localStorage?.getItem(RATE_KEY)); return v > 0 ? v : DEFAULT_CREDITS_PER_ILS; } catch { return DEFAULT_CREDITS_PER_ILS; }
};
let creditsPerIls = readCachedRate();
const listeners = new Set<() => void>();
export const getCreditsPerIls = () => creditsPerIls;
export function setCreditsPerIls(rate: number) {
  if (!Number.isFinite(rate) || rate <= 0 || rate === creditsPerIls) return;
  creditsPerIls = rate;
  try { globalThis.localStorage?.setItem(RATE_KEY, String(rate)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
export const subscribeCreditRate = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
/** @deprecated use getCreditsPerIls(); kept for the fallback value only. */
export const CREDITS_PER_ILS = DEFAULT_CREDITS_PER_ILS;
export const agorotPerCredit = () => 100 / creditsPerIls;

export const agorotToCredits = (agorot: number) => (agorot * creditsPerIls) / 100;
export const creditsToAgorot = (credits: number) => (credits * 100) / creditsPerIls;
export const ilsToCredits = (ils: number) => ils * creditsPerIls;
export const creditsToIls = (credits: number) => credits / creditsPerIls;
export const fmtIlsFromCredits = (credits: number) =>
  `₪${creditsToIls(credits).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
export const fmtCredits = (c: number) =>
  `${c.toLocaleString('he-IL', { maximumFractionDigits: Math.abs(c) < 1 ? 2 : 1 })} קרדיטים`;
/** תצוגה מקוצרת לשורות המחירון: "קר'" במקום "קרדיטים". */
export const fmtCreditsShort = (c: number) => fmtCredits(c).replace('קרדיטים', "קר'");
export const fmtCompactCredits = (c: number, maximumFractionDigits = 1) => {
  const magnitude = Math.abs(c);
  const divisor = magnitude >= 1_000_000 ? 1_000_000 : magnitude >= 1_000 ? 1_000 : 1;
  const suffix = divisor === 1_000_000 ? 'm' : divisor === 1_000 ? 'k' : '';
  return `${(c / divisor).toLocaleString('en-US', { maximumFractionDigits: magnitude < 1 ? 2 : maximumFractionDigits })}${suffix} קרדיטים`;
};

export const ACTION_META: Record<string, { icon: LucideIcon; tone: string }> = {
  social_post: { icon: Sparkles, tone: 'bg-warning/15 text-warning' },
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
