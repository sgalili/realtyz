import { describe, expect, it, vi } from 'vitest';
import { verifiedPhoneSession } from '../../supabase/functions/_shared/phoneSession';

describe('verified phone identity', () => {
  it('creates a phone-only user on an internal alias and returns only a magic-link hash', async () => {
    const createUser = vi.fn().mockResolvedValue({ data: { user: { id: 'new' } }, error: null });
    const generateLink = vi.fn().mockResolvedValue({ data: { properties: { hashed_token: 'test-hash' } }, error: null });
    const admin = { auth: { admin: { listUsers: vi.fn().mockResolvedValue({ data: { users: [] } }), createUser, generateLink } } };
    const result = await verifiedPhoneSession(admin, {}, '972500000000', 'whatsapp_wba');
    const created = createUser.mock.calls[0][0];
    expect(created.email).toBe('p972500000000@phone.toraff.invalid');
    expect(created.email_confirm).toBe(true);
    expect(created.phone_confirm).toBe(true);
    expect(created).not.toHaveProperty('password');
    expect(generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'p972500000000@phone.toraff.invalid' });
    expect(result).toEqual({ token_hash: 'test-hash' });
    expect(JSON.stringify(result)).not.toContain('password');
  });
  it('reuses legacy email identity and never creates a duplicate account', async () => {
    const createUser = vi.fn();
    const generateLink = vi.fn().mockResolvedValue({ data: { properties: { hashed_token: 'test-hash' } } });
    const admin = { auth: { admin: { listUsers: vi.fn().mockResolvedValue({ data: { users: [{ id: 'existing', phone: '+972500000000', email: 'legacy@whatsapp.realtyz.local' }] } }), createUser, generateLink } } };
    expect(await verifiedPhoneSession(admin, {}, '972500000000', 'whatsapp_wba')).toEqual({ token_hash: 'test-hash' });
    expect(createUser).not.toHaveBeenCalled();
  });
  it('fails closed if account lookup fails', async () => {
    const createUser = vi.fn();
    const admin = { auth: { admin: { listUsers: vi.fn().mockResolvedValue({ error: new Error('lookup failed') }), createUser } } };
    await expect(verifiedPhoneSession(admin, {}, '972500000000', 'whatsapp_wba')).rejects.toThrow('lookup failed');
    expect(createUser).not.toHaveBeenCalled();
  });
  it('records SMS verification against the exact authenticated phone account', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    const admin = { from: vi.fn().mockReturnValue({ upsert }), auth: { admin: {
      listUsers: vi.fn().mockResolvedValue({ data: { users: [{ id: 'own', phone: '+972501234567', email: 'account@example.com' }] } }),
      updateUserById, generateLink: vi.fn().mockResolvedValue({ data: { properties: { hashed_token: 'hash' } }, error: null }),
    } } };
    await verifiedPhoneSession(admin, {}, '972501234567', 'sms_019');
    expect(admin.from).toHaveBeenCalledWith('broker_sms_verifications');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'own', phone_number: '972501234567' }));
    expect(updateUserById).toHaveBeenCalledWith('own', { phone: '+972501234567', phone_confirm: true });
  });
});