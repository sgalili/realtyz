import { describe, expect, it } from 'vitest';
import { importJobPollInterval, importJobTargetKind } from './importJobMonitoring';

describe('external import monitoring', () => {
  it('polls queued and running jobs with read-only four-second checks', () => {
    expect(importJobPollInterval([{ status: 'pending' }])).toBe(4000);
    expect(importJobPollInterval([{ status: 'running' }])).toBe(4000);
    expect(importJobPollInterval([{ status: 'completed' }])).toBe(false);
    expect(importJobPollInterval([{ status: 'failed' }])).toBe(false);
  });
  it('counts developer requests as developers before any are saved', () => {
    expect(importJobTargetKind({ autoDevelopers: true, totalBrokerUrls: 0 })).toBe('developers');
    expect(importJobTargetKind({ totalDeveloperUrls: 3, totalBrokerUrls: 0 })).toBe('developers');
    expect(importJobTargetKind({ totalDeveloperUrls: 2, totalBrokerUrls: 2 })).toBe('links');
    expect(importJobTargetKind({ totalBrokerUrls: 10 })).toBe('brokers');
  });
});