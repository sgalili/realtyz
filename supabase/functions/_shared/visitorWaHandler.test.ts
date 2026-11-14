import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { handleVisitorWhatsApp, isVisitorWhatsApp } from './visitorWaHandler.ts';
import { VISITOR_WHATSAPP_INTRO } from './visitorWhatsAppPolicy.ts';

Deno.test('new visitor introduction never reads tenant tables', async () => {
  const admin = { from: () => { throw new Error('must not query CRM'); } };
  assertEquals(await isVisitorWhatsApp(admin, '972500000000', VISITOR_WHATSAPP_INTRO), true);
});
Deno.test('property UUID bypasses public session without reading visitor history', async () => {
  const admin = { from: () => { throw new Error('must not query visitor history'); } };
  assertEquals(await isVisitorWhatsApp(admin, '972500000000', '12345678-1234-1234-1234-123456789abc'), false);
});
Deno.test('duplicate webhook claim cannot generate or send another reply', async () => {
  const admin = { rpc: async (name: string) => {
    assertEquals(name, 'claim_visitor_whatsapp_message'); return { data: 'duplicate', error: null };
  }, from: () => { throw new Error('duplicate must not call model/send'); } };
  assertEquals(await handleVisitorWhatsApp(admin, { phone: '972500000000', text: VISITOR_WHATSAPP_INTRO, messageId: 'test-message' }), true);
});