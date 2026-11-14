export const VISITOR_WHATSAPP_INTRO = 'היי ריטה, הגעתי ל־TORAFF ואשמח לשמוע פרטים נוספים ולבדוק איך המערכת יכולה לעזור לי.';

/** An explicit property inquiry always retains its existing authorized routing. */
export function isVisitorIntroduction(text: string): boolean {
  return text.trim().normalize('NFC') === VISITOR_WHATSAPP_INTRO.normalize('NFC');
}
export function hasPropertyIdentity(text: string): boolean {
  return /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(text);
}