import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatchBrokerDemo } from './brokerOutreach.server';
const start = vi.hoisted(() => vi.fn());
vi.mock('./ritaVoiceOutbound.server', () => ({ startRitaOutboundCall: start }));
vi.mock('./brokerRitaContext.server', () => ({ loadBrokerRitaContext: async () => ({ firstName: 'דנה', gender: 'female', system: 'Rita', facts: 'ביקוש בהרצליה' }) }));
afterEach(() => vi.clearAllMocks());
function client(claim: unknown) {
  const updates: unknown[] = [];
  return { updates, admin: { rpc: vi.fn(async () => ({ data: claim, error: null })), from: () => {
    const q: Record<string, unknown> = {};
    q['update'] = (value: unknown) => { updates.push(value); return q; };
    q['eq'] = () => q;
    q['insert'] = async () => ({ error: null });
    q['then'] = (resolve: (value: unknown) => void) => resolve({ error: null });
    return q;
  } } };
}
describe('broker invitation provider fences', () => {
  it('does not dispatch without the atomic consent and due-time claim', async () => {
    const { admin } = client(null);
    expect(await dispatchBrokerDemo(admin as never, 'broker')).toEqual({ dispatched: false });
    expect(start).not.toHaveBeenCalled();
  });
  it('sends broker_invite with the verified OTP phone and scoped invitation facts', async () => {
    start.mockResolvedValue({ conversation_id: 'conversation-a' });
    const { admin } = client({ otp_verified_phone: '972500000034', call_due_at: new Date().toISOString() });
    expect(await dispatchBrokerDemo(admin as never, 'broker')).toEqual({ dispatched: true });
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ service: true, rawInput: expect.objectContaining({ call_role: 'broker_invite', workspace_owner_id: 'broker', phone_number: '972500000034', invite_context: 'ביקוש בהרצליה' }) }));
  });
  it('blocks ambiguous submissions instead of automatically replaying a call', async () => {
    start.mockRejectedValue(new Error('Unknown provider outcome'));
    const { admin, updates } = client({ otp_verified_phone: '972500000034', call_due_at: new Date().toISOString() });
    expect(await dispatchBrokerDemo(admin as never, 'broker')).toEqual({ dispatched: false, blocked: true });
    expect(start).toHaveBeenCalledTimes(1);
    expect(updates).toContainEqual(expect.objectContaining({ call_status: 'blocked' }));
  });
  it('does not send if the bounded dispatch window expires during context loading', async () => {
    const { admin } = client({ otp_verified_phone: '972500000034', call_due_at: new Date(Date.now() - 91_000).toISOString() });
    expect(await dispatchBrokerDemo(admin as never, 'broker')).toEqual({ dispatched: false, blocked: true });
    expect(start).not.toHaveBeenCalled();
  });
});
