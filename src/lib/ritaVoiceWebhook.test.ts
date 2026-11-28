import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { handleRitaPostCall } from './ritaVoiceWebhook.server';
function client(role: string) {
  const reads: string[] = [];
  const writes: Array<{ table: string; value: unknown }> = [];
  const context = { id: 'context-a', conversation_id: 'conversation-a', lead_id: null, workspace_owner_id: '00000000-0000-0000-0000-000000000034', property_id: null, direction: 'outbound', source: role, full_name: 'דנה כהן', lead_phone: '+972500000034', dynamic_variables: { call_role: role, hat: role }, property_context: {} };
  const admin = { rpc: async (name: string, value: unknown) => { writes.push({ table: name, value }); return { data: { received: true }, error: null }; }, from: (table: string) => {
    reads.push(table);
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'filter', 'limit']) query[method] = () => query;
    for (const method of ['insert', 'update', 'upsert']) query[method] = (value: unknown) => { writes.push({ table, value }); return query; };
    query['single'] = async () => ({ data: table === 'rita_voice_runtime' ? { agent_id: 'agent-a', webhook_secret: 'test-secret' } : { id: 'record-a' }, error: null });
    query['maybeSingle'] = async () => ({ data: table === 'rita_call_contexts' ? context : null, error: null });
    query['then'] = (resolve: (value: unknown) => void) => resolve({ error: null });
    return query;
  } };
  return { admin: admin as never, reads, writes };
}
describe('role-specific signed post-call processing', () => {
  it.each(['broker_support', 'broker_invite', 'general_inbound'])('does not turn a %s call into a property buyer lead', async role => {
    const { admin, reads, writes } = client(role);
    const payload = JSON.stringify({ type: 'post_call_transcription', data: { agent_id: 'agent-a', conversation_id: 'conversation-a', conversation_initiation_client_data: { dynamic_variables: { call_role: 'property_lead', lead_full_name: 'דנה כהן', lead_phone: '+972500000034' } }, analysis: { transcript_summary: 'סיכום שיחה' }, transcript: [] } });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', 'test-secret').update(`${timestamp}.${payload}`).digest('hex');
    await handleRitaPostCall(admin, payload, `t=${timestamp},v0=${signature}`);
    expect(reads).not.toContain('leads');
    expect(writes.filter(write => write.table === 'leads')).toEqual([]);
    const saved = writes.find(write => write.table === 'sync_rita_post_call');
    expect(saved?.value).toMatchObject({ _context_id: 'context-a', _result: expect.objectContaining({ compact: expect.objectContaining({ call_role: role }) }) });
  });
  it('rejects an invalid provider signature before any card matching or writes', async () => {
    const { admin, writes } = client('property_lead');
    await expect(handleRitaPostCall(admin, JSON.stringify({ type:'post_call_transcription',data:{ agent_id:'agent-a',conversation_id:'conversation-a' } }), 't=0,v0=invalid')).rejects.toThrow('Unauthorized');
    expect(writes).toEqual([]);
  });
});
