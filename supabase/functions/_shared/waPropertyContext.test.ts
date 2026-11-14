import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { propertyIdsFromText, resolveWaPropertyContext, retainPropertyReply } from './waPropertyContext.ts';
import { resolveWaContext } from './waContextRouter.ts';
const id = '12345678-1234-4234-9234-123456789abc';
const live = { id, workspace_owner_id: 'property-workspace', is_published: true, affiliate_enabled: false, distribution_paused: false, status: 'live', deal_type: 'rent', property_title: 'דירה בהרצליה' };
function client(rows: Record<string, unknown>[], lead: { id: string } | null = null) {
  const filters: Array<[string, string, unknown]> = [];
  return { filters, from(table: string) {
    const result = { data: table === 'listings' ? rows : lead, error: null };
    const q: any = { select: () => q, limit: () => q, maybeSingle: () => Promise.resolve(result), then: (fn: any) => Promise.resolve(result).then(fn), in: (key: string, value: unknown) => { filters.push([table, key, value]); return q; }, eq: (key: string, value: unknown) => { filters.push([table, key, value]); return q; } };
    return q;
  } };
}
Deno.test('extracts an explicit UUID from Hebrew text or a pasted link', () => {
  assertEquals(propertyIdsFromText(`פרטים https://toraff.co.il/p/${id.toUpperCase()}`), [id]);
  assertEquals(propertyIdsFromText(`x${id}`), []);
  assertEquals(propertyIdsFromText('not-a-uuid'), []);
});
Deno.test('property workspace wins over sender phone history without selecting another lead', async () => {
  const db = client([live]);
  const result = await resolveWaContext(db, '972501234567', `אשמח לפרטים ${id}`);
  assertEquals(result, { leadId: null, ownerId: 'property-workspace', listingId: id, reason: 'explicit_property_uuid' });
  assertEquals(db.filters.some(([table, key, value]) => table === 'leads' && key === 'workspace_owner_id' && value === 'property-workspace'), true);
  assertEquals(db.filters.some(([table, key, value]) => table === 'leads' && key === 'phone_number' && Array.isArray(value) && value.includes('972501234567')), true);
});
Deno.test('uses only this sender lead in the property workspace', async () => {
  assertEquals((await resolveWaContext(client([live], { id: 'sender-lead' }), '972501234567', id)).leadId, 'sender-lead');
});
Deno.test('rejects drafts, paused, ended and ambiguous properties', async () => {
  for (const changes of [{ is_published: false }, { distribution_paused: true }, { status: 'sold' }, { workspace_owner_id: null }]) assertEquals(await resolveWaPropertyContext(client([{ ...live, ...changes }]), id), null);
  assertEquals(await resolveWaPropertyContext(client([live, { ...live, id: '22345678-1234-4234-9234-123456789abc' }]), id), null);
});
Deno.test('replaces generic buyer fallback with the explicitly named property', async () => {
  const context = await resolveWaPropertyContext(client([live]), id);
  if (!context) throw new Error('Missing test context');
  assertEquals(retainPropertyReply('כדי לדייק לך את האפשרויות, מה הכי חשוב כרגע: מספר החדרים או התקציב?', context), 'הפנייה מתייחסת לדירה בהרצליה. אילו פרטים נוספים על הנכס תרצו לקבל?');
  assertEquals(retainPropertyReply('יש בדירה ארבעה חדרים.', context), 'יש בדירה ארבעה חדרים.');
});