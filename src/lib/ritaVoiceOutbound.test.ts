import { afterEach, describe, expect, it, vi } from 'vitest';
import { startRitaOutboundCall } from './ritaVoiceOutbound.server';

const LEAD_ID = '00000000-0000-0000-0000-000000000001';
const PROPERTY_ID = '00000000-0000-0000-0000-000000000002';
const BROKER_ID = '00000000-0000-0000-0000-000000000003';

function mockClients(brokerAccount = true) {
  const contexts: Array<Record<string, unknown>> = [];
  const admin = { from: (table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'update']) query[method] = () => query;
    query['maybeSingle'] = async () => ({ data: table === 'leads'
      ? { id: LEAD_ID, full_name: 'דנה כהן', phone_number: '972501234567', workspace_owner_id: BROKER_ID, linked_listing_id: PROPERTY_ID }
      : table === 'listings'
        ? { id: PROPERTY_ID, property_title: 'דירת גן', city: 'הרצליה', neighborhood: 'המרכז', rooms: 4, asking_price: 2500000, deal_type: 'sale', workspace_owner_id: BROKER_ID }
        : table === 'profiles'
          ? { full_name: 'דני לוי', broker_byline: null, phone: '972501234567' }
          : table === 'white_label_settings'
            ? { agency_name: 'משרד הדוגמה' }
            : null, error: null });
    query['single'] = async () => ({ data: table === 'rita_voice_runtime'
      ? { agent_id: 'agent-a', agent_phone_number_id: 'phone-a' }
      : table === 'rita_call_contexts'
        ? { id: 'context-a' }
        : table === 'profiles' ? { full_name: 'דני לוי', phone: '972501234567' }
        : table === 'broker_outreach_journeys' ? { enabled: true, call_consent_at: 'saved', interested_at: 'saved', opted_out_at: null, cancel_requested_at: null, otp_verified_phone: '972501234567' }
        : null, error: null });
    query['insert'] = (value: Record<string, unknown>) => {
      if (table === 'rita_call_contexts') contexts.push(value);
      return query;
    };
    query['then'] = (resolve: (value: { error: null }) => void) => resolve({ error: null });
    return query;
  } };
  const userClient = { from: (table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'limit']) query[method] = () => query;
    query['maybeSingle'] = async () => ({ data: table === 'user_roles' ? (brokerAccount ? { user_id: BROKER_ID } : null) : { id: LEAD_ID, workspace_owner_id: BROKER_ID }, error: null });
    return query;
  } };
  return { admin: admin as never, userClient: userClient as never, contexts };
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Rita outbound context', () => {
  it('resolves real broker, lead and property facts and sends them to ElevenLabs', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-key');
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(_url.endsWith('/user/subscription') ? { character_count: 0, character_limit: 1000, can_extend_character_limit: false } : { success: true, conversation_id: 'conversation-a', callSid: 'call-a' })));
    vi.stubGlobal('fetch', fetchMock);
    const { admin, userClient } = mockClients();
    const result = await startRitaOutboundCall({ admin, userClient, userId: BROKER_ID, rawInput: { lead_id: LEAD_ID, property_id: PROPERTY_ID, source: 'property_callback', phone_number: '+972599999999' } });
    expect(result.success).toBe(true);
    const request = JSON.parse(String(fetchMock.mock.calls.find(call => call[0].endsWith('/outbound-call'))?.[1]?.body));
    const variables = request.conversation_initiation_client_data.dynamic_variables;
    expect(request.to_number).toBe('+972501234567');
    expect(variables).toMatchObject({ call_role: 'property_lead', hat: 'property_lead', agency_name: 'משרד הדוגמה', agent_name: 'דני לוי', broker_id: BROKER_ID, lead_name: 'דנה', lead_full_name: 'דנה כהן', lead_phone: '+972501234567', property_id: PROPERTY_ID, rita_call_context_id: 'context-a' });
    expect(JSON.parse(variables.property_context)).toMatchObject({ title: 'דירת גן', city: 'הרצליה', neighborhood: 'המרכז', rooms: 4, price: 2500000 });
    expect(request.conversation_initiation_client_data.conversation_config_override.agent.first_message).toContain('שלום דנה, אני ריטה');
  });
  it('does not let a property lead impersonate a broker invitation', async () => {
    const { admin, userClient } = mockClients();
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(startRitaOutboundCall({ admin, userClient, userId: BROKER_ID, rawInput: { lead_id: LEAD_ID, call_role: 'broker_invite' } })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects mismatched explicit hats before contacting the provider', async () => {
    const { admin, userClient } = mockClients();
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(startRitaOutboundCall({ admin, userClient, userId: BROKER_ID, rawInput: { lead_id: LEAD_ID, call_role: 'property_lead', hat: 'broker_support' } })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    { rawInput: { phone_number: '+972501234567', call_role: 'broker_support' }, role: 'broker_support', duration: undefined, service: false },
    { rawInput: { demo: true, call_role: 'general_inbound' }, role: 'general_inbound', duration: undefined, service: false },
    { rawInput: { workspace_owner_id: BROKER_ID, phone_number: '+972501234567', call_role: 'broker_invite', invite_context: 'ביקוש בהרצליה' }, role: 'broker_invite', duration: 90, service: true },
  ])('sends the verified $role call context to ElevenLabs', async ({ rawInput, role, duration, service }) => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-key');
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(_url.endsWith('/user/subscription') ? { character_count: 0, character_limit: 1000, can_extend_character_limit: false } : { success: true, conversation_id: 'conversation-a' })));
    vi.stubGlobal('fetch', fetchMock);
    const { admin, userClient } = mockClients();
    await startRitaOutboundCall({ admin, userClient, userId: service ? null : BROKER_ID, rawInput, ...(service ? { service: true } : {}) });
    const body = JSON.parse(String(fetchMock.mock.calls.find(call => call[0].endsWith('/outbound-call'))?.[1]?.body));
    expect(body.conversation_initiation_client_data.dynamic_variables.call_role).toBe(role);
    expect(body.conversation_initiation_client_data.conversation_config_override.conversation?.max_duration_seconds).toBe(duration);
  });
  it('does not grant broker support to a non-broker account', async () => {
    const { admin, userClient } = mockClients(false);
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(startRitaOutboundCall({ admin, userClient, userId: BROKER_ID, rawInput: { phone_number: '+972501234567', call_role: 'broker_support' } })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not save or dial a call with the observed four-credit provider balance', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-key');
    const fetchMock = vi.fn(async (_url: string) => Response.json({ character_count: 87872, character_limit: 87876, can_extend_character_limit: false }));
    vi.stubGlobal('fetch', fetchMock);
    const { admin, userClient, contexts } = mockClients();
    await expect(startRitaOutboundCall({ admin, userClient, userId: BROKER_ID, rawInput: { lead_id: LEAD_ID } })).rejects.toThrow('4 קרדיטים');
    expect(contexts).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.elevenlabs.io/v1/user/subscription');
  });
});
