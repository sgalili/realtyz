import { describe, expect, it } from 'vitest';
import { mayEditBrokerIdentityField, mayFetchRegistryInReview, registryIdentityLocked } from './brokerProfilePolicy';
describe('official broker identity', () => {
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