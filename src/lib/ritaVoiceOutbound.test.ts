import { afterEach, describe, expect, it, vi } from 'vitest';
import { startRitaOutboundCall } from './ritaVoiceOutbound.server';

const LEAD_ID = '00000000-0000-0000-0000-000000000001';
const PROPERTY_ID = '00000000-0000-0000-0000-000000000002';
const BROKER_ID = '00000000-0000-0000-0000-000000000003';

function mockClients() {
  const contexts: Array<Record<string, unknown>> = [];
  const admin = { from: (table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'update']) query[method] = () => query;
    query['maybeSingle'] = async () => ({ data: table === 'leads'
      ? { id: LEAD_ID, full_name: 'דנה כהן', phone_number: '972501234567', workspace_owner_id: BROKER_ID, linked_listing_id: PROPERTY_ID }
      : table === 'listings'
        ? { id: PROPERTY_ID, property_title: 'דירת גן', city: 'הרצליה', neighborhood: 'המרכז', rooms: 4, asking_price: 2500000, deal_type: 'sale', workspace_owner_id: BROKER_ID }
        : table === 'profiles'
          ? { full_name: 'דני לוי', broker_byline: null }
          : table === 'white_label_settings'
            ? { agency_name: 'משרד הדוגמה' }
            : null, error: null });
    query['single'] = async () => ({ data: table === 'rita_voice_runtime'
      ? { agent_id: 'agent-a', agent_phone_number_id: 'phone-a' }
      : table === 'rita_call_contexts'
        ? { id: 'context-a' }
        : null, error: null });
    query['insert'] = (value: Record<string, unknown>) => {
      if (table === 'rita_call_contexts') contexts.push(value);
      return query;
    };
    query['then'] = (resolve: (value: { error: null }) => void) => resolve({ error: null });
    return query;
  } };
  const userClient = { from: () => {
    const query: Record<string, unknown> = {};
    query['select'] = () => query; query['eq'] = () => query;
    query['maybeSingle'] = async () => ({ data: { id: LEAD_ID, workspace_owner_id: BROKER_ID }, error: null });
    return query;
  } };
  return { admin: admin as never, userClient: userClient as never, contexts };
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Rita outbound context', () => {
  it('resolves real broker, lead and property facts and sends them to ElevenLabs', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-key');
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ success: true, conversation_id: 'conversation-a', callSid: 'call-a' })));
    vi.stubGlobal('fetch', fetchMock);
    const { admin, userClient } = mockClients();
    const result = await startRitaOutboundCall({ admin, userClient, userId: BROKER_ID, rawInput: { lead_id: LEAD_ID, property_id: PROPERTY_ID, source: 'property_callback', phone_number: '+972599999999' } });
    expect(result.success).toBe(true);
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const variables = request.conversation_initiation_client_data.dynamic_variables;
    expect(request.to_number).toBe('+972501234567');
    expect(variables).toMatchObject({ agency_name: 'משרד הדוגמה', agent_name: 'דני לוי', broker_id: BROKER_ID, lead_name: 'דנה', lead_full_name: 'דנה כהן', lead_phone: '+972501234567', property_id: PROPERTY_ID, rita_call_context_id: 'context-a' });
    expect(variables.property_context).toMatchObject({ title: 'דירת גן', city: 'הרצליה', neighborhood: 'המרכז', rooms: 4, price: 2500000 });
    expect(request.conversation_initiation_client_data.conversation_config_override.agent.first_message).toContain('שלום דנה, אני ריטה');
  });
});
