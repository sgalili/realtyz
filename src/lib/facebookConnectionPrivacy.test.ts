import { describe, expect, it } from 'vitest';
import { acceptsFacebookConnectionRequest } from '../../supabase/functions/_shared/facebookConnectionPrivacy';

describe('Facebook connection privacy boundary', () => {
  it('rejects passwords including nested credential fields', () => {
    expect(acceptsFacebookConnectionRequest({ action: 'remote_login', password: 'test-only' })).toBe(false);
    expect(acceptsFacebookConnectionRequest({ action: 'remote_login', data: { Password: 'test-only' } })).toBe(false);
  });
  it('rejects manual cookie/session credential uploads', () => {
    expect(acceptsFacebookConnectionRequest({ action: 'save' })).toBe(false);
    expect(acceptsFacebookConnectionRequest({ action: 'remote_check', cookies: [] })).toBe(false);
    expect(acceptsFacebookConnectionRequest({ action: 'remote_login', access_token: 'test-only' })).toBe(false);
  });
  it('allows password-free connection and server worker result commands', () => {
    expect(acceptsFacebookConnectionRequest({ action: 'remote_login' })).toBe(true);
    expect(acceptsFacebookConnectionRequest({ action: 'remote_check' })).toBe(true);
    expect(acceptsFacebookConnectionRequest({ action: 'fetch_result', groups: [{ group_id: '123', is_member: true }] })).toBe(true);
  });
});