import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isVisitorIntroduction, hasPropertyIdentity, VISITOR_WHATSAPP_INTRO } from './visitorWhatsAppPolicy.ts';
Deno.test('requested WhatsApp introduction activates public visitor routing', () => {
  assertEquals(isVisitorIntroduction('היי ריטה, הגעתי ל־TORAFF ואשמח לשמוע פרטים נוספים ולבדוק איך המערכת יכולה לעזור לי.'), true);
  assertEquals(isVisitorIntroduction('היי ריטה'), false);
});
Deno.test('property identities take precedence over public visitor sessions', () => {
  assertEquals(hasPropertyIdentity(`${VISITOR_WHATSAPP_INTRO} 12345678-1234-1234-1234-123456789abc`), true);
  assertEquals(hasPropertyIdentity(VISITOR_WHATSAPP_INTRO), false);
});