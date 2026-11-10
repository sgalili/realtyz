import { publicUrl } from './publicUrl';

export function brokerInvitation(broker: { id: string; full_name?: string | null }) {
  const link = publicUrl(`/auth?broker=${encodeURIComponent(broker.id)}`);
  return { link, message: `שלום${broker.full_name?.trim() ? ` ${broker.full_name.trim()}` : ''},\nברוכים הבאים ל-TORAFF!\nהכנו עבורך מרחב עבודה עם הנכסים שלך.\nלכניסה באמצעות קוד SMS: ${link}\nלאחר הכניסה ניתן לצפות בנכסים שלי ולהגדיר עמלות סגירה למכירה ולהשכרה, לכל הנכסים או לכל נכס בנפרד.` };
}

export function firstBrokerDestination(value: unknown): '/' | '/properties' {
  return value === '/properties' ? '/properties' : '/';
}