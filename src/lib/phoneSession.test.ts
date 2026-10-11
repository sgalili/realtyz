import { describe, expect, it, vi } from 'vitest';
import { verifiedPhoneSession } from '../../supabase/functions/_shared/phoneSession';

describe('verified phone identity', () => {
  it('creates a phone-only user without email and returns only session tokens', async () => {
    const createUser = vi.fn().mockResolvedValue({ error: null });
    const signInWithPassword = vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-access', refresh_token: 'test-refresh' } }, error: null });
    const admin = { auth: { admin: { listUsers: vi.fn().mockResolvedValue({ data: { users: [] } }), createUser } } };
    const result = await verifiedPhoneSession(admin, { auth: { signInWithPassword } }, '972500000000', 'whatsapp_wba');
    expect(createUser.mock.calls[0][0]).not.toHaveProperty('email');
    expect(createUser.mock.calls[0][0].phone_confirm).toBe(true);
    expect(result).toEqual({ session: { access_token: 'test-access', refresh_token: 'test-refresh' } });
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
});