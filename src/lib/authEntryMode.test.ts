import { describe, expect, it } from 'vitest';
import { authEntrySignup } from './authEntryMode';
describe('platform-specific auth entry', () => {
  it('defaults broker mode to OTP login', () => expect(authEntrySignup({ brokersOnly: true, invitedBroker: false, search: '' })).toBe(false));
  it('keeps full marketplace default registration', () => expect(authEntrySignup({ brokersOnly: false, invitedBroker: false, search: '' })).toBe(true));
  it('keeps explicit free registration across reload', () => expect(authEntrySignup({ brokersOnly: true, invitedBroker: false, search: '?mode=signup' })).toBe(true));
  it('opens an existing account through explicit login', () => expect(authEntrySignup({ brokersOnly: false, invitedBroker: false, search: '?mode=login' })).toBe(false));
  it('never registers an invited broker as a new account', () => expect(authEntrySignup({ brokersOnly: true, invitedBroker: true, search: '?mode=signup', signupState: true })).toBe(false));
});