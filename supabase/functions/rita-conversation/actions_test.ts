import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { validAction, hasReplyWindow, executeConversationAction, claimAndExecute, type ConversationScope } from './actions.ts';
const scope: ConversationScope = { kind: 'lead', target: 'lead', actor: 'actor', workspace: 'workspace', interaction: 'interaction' };
Deno.test('community cannot execute CRM or property operations', () => {
  assertEquals(validAction('advance_lead', { stage: 'negotiation' }, { ...scope, kind: 'peer' }), false);
  assertEquals(validAction('send_property', { listing_id: '00000000-0000-0000-0000-000000000000' }, { ...scope, kind: 'group' }), false);
});
Deno.test('lead stage tool never closes deals', () => {
  assertEquals(validAction('advance_lead', { stage: 'closed' }, scope), false);
  assertEquals(validAction('advance_lead', { stage: 'negotiation' }, scope), true);
});
Deno.test('official free-text window stops at 24 hours and rejects future receipts', () => {
  const now = Date.parse('2026-11-14T12:00:00Z');
  assertEquals(hasReplyWindow([{ created_at: '2026-11-13T12:00:01Z' }], now), true);
  assertEquals(hasReplyWindow([{ created_at: '2026-11-13T12:00:00Z' }], now), false);
  assertEquals(hasReplyWindow([{ created_at: '2026-11-15T12:00:00Z' }], now), false);
});
Deno.test('inaccessible lead cannot invoke external delivery', async () => {
  let sends = 0;
  const admin = { functions: { invoke: () => { sends++; } } };
  const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null }) };
  await assertRejects(() => executeConversationAction(admin, { from: () => query }, scope, 'send_message', { content: 'שלום' }));
  assertEquals(sends, 0);
});
Deno.test('already claimed action cannot execute a second time', async () => {
  const query: any = { update: () => query, eq: () => query, select: () => query, maybeSingle: async () => ({ data: null }) };
  await assertRejects(() => claimAndExecute({ from: () => query }, {}, scope, 'action'), Error, 'כבר הופעלה');
});
Deno.test('WhatsApp execution forces official transport and records verified provider id', async () => {
  let sent: any = null; let recorded: any = null;
  const admin = { rpc: async (name: string, args: any) => { if (name === 'record_interaction_message') recorded = args; return { data: false }; }, functions: { invoke: async (_: string, args: any) => { sent = args.body; return { data: { success: true, message_id: 'provider-verified-id' } }; } } };
  const client = { from: (table: string) => { const q: any = { select: () => q, eq: () => q, order: () => q, limit: async () => ({ data: [{ created_at: new Date().toISOString() }] }), maybeSingle: async () => ({ data: table === 'leads' ? { id: 'lead', workspace_owner_id: 'workspace', preferences: {} } : null }) }; return q; } };
  const result = await executeConversationAction(admin, client, scope, 'send_message', { content: 'שלום' });
  assertEquals(result.success, true);
  assertEquals(sent.force_official, true);
  assertEquals(sent.tenant_id, 'workspace');
  assertEquals(sent.lead_id, 'lead');
  assertEquals(recorded._external_id, 'provider-verified-id');
});
Deno.test('recipient opt-out prevents provider calls', async () => {
  let sends = 0;
  const admin = { rpc: async () => ({ data: false }), functions: { invoke: async () => { sends++; } } };
  const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { preferences: { whatsapp_opt_out: true } } }) };
  await assertRejects(() => executeConversationAction(admin, { from: () => query }, scope, 'send_message', { content: 'שלום' }), Error, 'שלא לקבל');
  assertEquals(sends, 0);
});