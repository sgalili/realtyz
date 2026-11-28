import { afterEach, describe, expect, it, vi } from 'vitest';
import { authorizeRitaLinkRequest, ritaWhatsappLinksSchema, sendRitaWhatsappLinks } from './ritaWhatsappLinks.server';

const property = '00000000-0000-0000-0000-000000000001';
const input = { rita_call_context_id: '00000000-0000-0000-0000-000000000002', lead_phone: '+972501234567', property_ids: [property], confirmed: true as const };
const context = { lead_phone: '+972501234567', workspace_owner_id: 'owner', status: 'queued', dynamic_variables: { is_test_call: false }, source_context: { searched_property_ids: [property] } };
describe('confirmed Rita WhatsApp authorization', () => {
  it('requires explicit approval', () => { expect(ritaWhatsappLinksSchema.safeParse({ ...input, confirmed: false }).success).toBe(false); });
  it('never accepts an arbitrary destination', () => { expect(() => authorizeRitaLinkRequest(context, { ...input, lead_phone: '+972509999999' })).toThrow('Invalid caller phone'); });
  it('never accepts a property not returned in this call', () => { expect(() => authorizeRitaLinkRequest(context, { ...input, property_ids: ['00000000-0000-0000-0000-000000000099'] })).toThrow('property was not returned'); });
  it('blocks actual sends during test calls', () => { expect(() => authorizeRitaLinkRequest({ ...context, dynamic_variables: { is_test_call: true } }, input)).toThrow('test calls'); });
  it('does not guess a workspace for unknown callers', () => { expect(() => authorizeRitaLinkRequest({ ...context, workspace_owner_id: null }, input)).toThrow('Invalid active call context'); });
  it('allows equivalent formats of the stored caller phone', () => { expect(authorizeRitaLinkRequest(context, { ...input, lead_phone: '050-1234567' })).toBe('972501234567'); });
  it('limits a request to three property links', () => { expect(ritaWhatsappLinksSchema.safeParse({ ...input, property_ids: Array(4).fill(property) }).success).toBe(false); });
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('official WhatsApp send outcome', () => {
  it('uses only the official lane, persists acceptance and does not resend duplicates', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://official-test.invalid'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-server-key');
    let claimed = false; let state = 'sending';
    const admin = { rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'rita_whatsapp_service_window') return { data: true, error: null };
      state = String(args['_status']); return { error: null };
    }, from: (table: string) => {
      let insert = false;
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'in', 'is', 'or', 'limit']) query[method] = () => query;
      query['insert'] = () => { insert = true; return query; };
      query['single'] = async () => {
        if (table === 'rita_call_contexts') return { data: { ...context, id: input.rita_call_context_id, full_name: 'דני כהן' }, error: null };
        if (insert && claimed) return { data: null, error: { code: '23505' } };
        if (insert) { claimed = true; return { data: { id: 'send-id' }, error: null }; }
        return { data: { status: state, error: null }, error: null };
      };
      query['then'] = (resolve: (data: unknown) => void) => resolve({ data: [{ id: property, property_title: 'דירה', asking_price: 2500000, deal_type: 'sale' }], error: null });
      return query;
    } };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true, provider: 'WBA', message_id: 'wamid-real-test' })); vi.stubGlobal('fetch', fetchMock);
    const first = await sendRitaWhatsappLinks(admin as never, input);
    const second = await sendRitaWhatsappLinks(admin as never, input);
    expect(first.status).toBe('accepted'); expect(second.duplicate).toBe(true); expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body ?? '{}');
    expect(body.force_official).toBe(true); expect(body.phone_number).toBe('972501234567'); expect(body.tenant_id).toBe('owner');
    expect(body.message).toContain(`https://toraff.co.il/p/${property}`);
  });
});