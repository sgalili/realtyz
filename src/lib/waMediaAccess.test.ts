import { describe, expect, it } from 'vitest';
import { mediaCredentials, mediaLookupFailure, missingMediaCredentials, safeMetaMediaUrl } from '../../supabase/functions/_shared/waMediaAccess';

describe('WhatsApp media access', () => {
  it('returns an unavailable attachment state requiring authorization, not playable JSON', () => {
    expect(missingMediaCredentials()).toEqual({ available: false, error: 'media_credentials_missing', reason: 'authorization_required', stage: 'credentials' });
  });
  it('uses the receiving phone credential, never a newer unrelated token', () => {
    expect(mediaCredentials([
      { config: { phone_number_id: 'other', access_token: 'wrong' } },
      { config: { phone_number_id: '1288958124292127', access_token: 'right', api_version: 'v23.0' } },
    ], '1288958124292127', 'owner', { accessToken: 'central-wrong', apiVersion: 'v26.0', phoneNumberId: 'other' })).toEqual([
      { accessToken: 'right', apiVersion: 'v23.0', phoneNumberId: '1288958124292127' },
    ]);
  });
  it('does not use another workspace when no phone is saved', () => {
    expect(mediaCredentials([{ user_id: 'other', config: { access_token: 'wrong' } }], '', 'owner', null)).toEqual([]);
  });
  it('does not retry a phone credential explicitly marked unauthorized', () => {
    expect(mediaCredentials([{ config: { phone_number_id: '1288958124292127', access_token: 'revoked', authorized: false } }], '1288958124292127', 'owner', null)).toEqual([]);
  });
  it('distinguishes inaccessible objects from expired permissions and rate limits', () => {
    expect(mediaLookupFailure(400, { code: 100, error_subcode: 33 })).toEqual({ unavailable: true, reason: 'expired_or_inaccessible' });
    expect(mediaLookupFailure(401, { code: 190 })).toEqual({ unavailable: false, reason: 'permissions' });
    expect(mediaLookupFailure(429, {})).toEqual({ unavailable: false, reason: 'provider_error' });
  });
  it('never forwards credentials to arbitrary download hosts', () => {
    expect(safeMetaMediaUrl('https://lookaside.fbsbx.com/whatsapp_business/attachments')).toBe(true);
    expect(safeMetaMediaUrl('https://facebook.com.evil.example/file')).toBe(false);
    expect(safeMetaMediaUrl('http://lookaside.fbsbx.com/file')).toBe(false);
  });
});