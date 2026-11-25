import { describe, expect, it } from 'vitest';
import { importEntityProgress, pendingRedLicenses } from './brokerAdminMetrics';
describe('current admin queue counters', () => {
  it('counts only current red shields, excluding verified, skipped and developer cards', () => {
    expect(pendingRedLicenses([{ license_number: '123' }, { license_number: '456', license_verified: true }, { license_number: '789', registry_no_match: true }, { license_number: '101', is_developer: true }, {}])).toBe(1);
  });
  it('uses active broker and developer checkpoints rather than completed history', () => {
    expect(importEntityProgress([{ status: 'completed', checkpoint: { brokerIndex: 100, totalBrokerUrls: 100 } }, { status: 'running', checkpoint: { brokerIndex: 2, developerIndex: 1, totalBrokerUrls: 8, totalDeveloperUrls: 4 } }])).toEqual({ done: 3, total: 12 });
  });
  it('uses persisted automatic import totals even before a source frontier exists', () => {
    expect(importEntityProgress([{ status: 'running', brokers_done: 7, developers_done: 2, target_brokers: 40, checkpoint: {} }])).toEqual({ done: 9, total: 40 });
  });
});