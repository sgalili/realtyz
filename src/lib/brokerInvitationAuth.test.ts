import { describe, expect, it, vi } from 'vitest';
import { invitedBrokerSession, requireInvitedBrokerPhone } from '../../supabase/functions/_shared/brokerInvitationAuth';

const id = '00000000-0000-4000-8000-000000000001';
function adminFor(phone: string | null, count = 1, roles: string[] = []) {
  const generateLink = vi.fn().mockResolvedValue({ data: { properties: { hashed_token: 'test-only-hash' } } });
  const admin = { from: (table: string) => {
    const query: any = { select: (_: string, options?: {count?: string}) => { query.counting = !!options?.count; return query; }, eq: () => query, not: () => query,
      maybeSingle: async () => ({ data: table === 'broker_whatsapp_contacts' ? phone ? { whatsapp_phone: phone } : null : table === 'admin_broker_onboarding' ? { user_id: id } : null }),
      then: (resolve: (value: unknown) => void) => resolve(query.counting ? { count } : { data: roles.map(role => ({role})) }),
    }; return query;
  }, auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { id, email: 'test@example.invalid' } } }), generateLink, updateUserById: vi.fn() } } };
  return admin;
}
describe('broker invitation identity', () => {
  it('accepts only the saved personal WhatsApp after normalized entry', async () => {
    expect(await requireInvitedBrokerPhone(adminFor('972502222222'), id, '050-2222222')).toBe(true);
  });
  it('rejects a raw imported/login number different from WhatsApp without issuing a session', async () => {
    const admin = adminFor('972502222222');
    await expect(invitedBrokerSession(admin, id, '0503333333')).rejects.toThrow();
    expect(admin.auth.admin.generateLink).not.toHaveBeenCalled();
  });
  it('rejects an absent personal WhatsApp', async () => { await expect(requireInvitedBrokerPhone(adminFor(null), id, '0503333333')).rejects.toThrow(); });
  it('rejects a number shared by two broker accounts', async () => { await expect(requireInvitedBrokerPhone(adminFor('972502222222', 2), id, '0502222222')).rejects.toThrow(); });
  it('issues the intended account session without updating its login phone', async () => {
    const admin = adminFor('972502222222');
    expect((await invitedBrokerSession(admin, id, '0502222222')).existing_account).toBe(true);
    expect(admin.auth.admin.getUserById).toHaveBeenCalledWith(id);
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
  it('does not change developer invitation authentication', async () => { expect(await requireInvitedBrokerPhone(adminFor(null, 0, ['developer']), id, '0503333333')).toBe(false); });
});