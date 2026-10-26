import { removeTelephoneEmojis } from './postGeneration.ts';

export const PROMOTIONAL_FOOTERS = [
  'פורסם אוטומטית דרך TORAFF - לוח שותפים חכם',
  'נוצר ופורסם בשניות באמצעות TORAFF. הצטרפו למהפכה',
  'העסקה הבאה שלכם מתחילה ב-TORAFF | לוח נדל"ן ושיתופי פעולה',
  'מפרסמים חכם יותר, מהיר יותר. TORAFF - לוח שותפים מטורף',
  'כל הנכסים, כל השותפים, במקום אחד. TORAFF',
  'פורסם דרך מערכת TORAFF לניהול נכסים ושיווק אוטומטי',
  'סוגרים עסקאות נדל"ן בקלות עם TORAFF - לוח השותפים המוביל',
  'מפיצים קמפיינים חכם ומהיר. TORAFF - לוח שותפים מטורף',
  'הדרך המתקדמת ביותר לשיווק נכסים. TORAFF',
  'שותפים להצלחה שלך בנדל"ן. TORAFF - לוח שותפים',
] as const;

export function stripPromotionalFooter(text: string): string {
  return text.split('\n').filter(line => !PROMOTIONAL_FOOTERS.some(footer => line.trim() === footer)).join('\n').trim();
}

export function appendPromotionalFooter(text: string, index: number, maxLength?: number): string {
  const footer = PROMOTIONAL_FOOTERS[index];
  if (!footer) throw new Error('Invalid promotional footer assignment');
  let body = removeTelephoneEmojis(stripPromotionalFooter(text));
  if (maxLength !== undefined) body = body.slice(0, Math.max(0, maxLength - footer.length - 2)).trimEnd();
  return body ? `${body}\n\n${footer}` : footer;
}

/** Service-only allocation; no footer is ever returned to an editing surface. */
export async function publishedPostText(db: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }, workspace: string, key: string, text: string, maxLength?: number): Promise<string> {
  const { data, error } = await db.rpc('claim_published_post_footer', { _workspace: workspace, _publication_key: key });
  if (error || typeof data !== 'number') throw new Error('לא ניתן להכין את חתימת הפרסום. נסו שוב.');
  return appendPromotionalFooter(text, data, maxLength);
}