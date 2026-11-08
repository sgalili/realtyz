import { describe, expect, it } from 'vitest';
import { brokerLicenseState, mayEditBrokerIdentityField, mayFetchRegistryInReview, registryIdentityLocked } from './brokerProfilePolicy';
describe('official broker identity', () => {
  it('shows matching 31927721 evidence as verified and active only with server entitlement', () => {
    expect(brokerLicenseState({ evidenceLicense: '31927721', storedLicense: '31927721', active: true, suspended: false })).toEqual({ verified: true, active: true });
    expect(brokerLicenseState({ evidenceLicense: '31927721', storedLicense: '31927721', active: false, suspended: false })).toEqual({ verified: true, active: false });
  });
  it('does not mark unmatched or suspended licenses active', () => {
    expect(brokerLicenseState({ evidenceLicense: '31927722', storedLicense: '31927721', active: true, suspended: false })).toEqual({ verified: false, active: false });
    expect(brokerLicenseState({ evidenceLicense: '31927721', storedLicense: '31927721', active: true, suspended: true })).toEqual({ verified: true, active: false });
  });
  it('locks full name after registry retrieval', () => {
    expect(mayEditBrokerIdentityField('fullName', registryIdentityLocked({ locked_broker_name: 'אידלסון דולי' }))).toBe(false);
    expect(mayEditBrokerIdentityField('fullName', registryIdentityLocked({}))).toBe(true);
  });
  it('locks city even when the official registry city is empty', () => {
    expect(mayEditBrokerIdentityField('city', registryIdentityLocked({ locked_broker_city: '' }))).toBe(false);
    expect(mayEditBrokerIdentityField('city', false)).toBe(true);
    expect(mayEditBrokerIdentityField('phone', true)).toBe(true);
  });
  it('permits fetching only in failed automatic-fetch Super Admin pending review', () => {
    const pending = { superAdmin: true, pending: true, registryHolderName: null, identityLocked: false };
    expect(mayFetchRegistryInReview(pending)).toBe(true);
    expect(mayFetchRegistryInReview({ ...pending, superAdmin: false })).toBe(false);
    expect(mayFetchRegistryInReview({ ...pending, pending: false })).toBe(false);
    expect(mayFetchRegistryInReview({ ...pending, identityLocked: true })).toBe(false);
    expect(mayFetchRegistryInReview({ ...pending, registryHolderName: 'אידלסון דולי' })).toBe(false);
  });
});