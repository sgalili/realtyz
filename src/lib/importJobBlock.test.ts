import { describe, expect, it } from 'vitest';
import { importJobBlock } from './importJobBlock';
const now = 1_000_000;
describe('importJobBlock', () => {
  it('flags 407 / client_10020 as a provider account problem', () => {
    expect(importJobBlock({ status: 'failed' }, { lastError: { status: 407, message: 'x' } }, now)?.kind).toBe('provider_account');
    expect(importJobBlock({ status: 'running' }, { lastError: { message: 'Bright Data client_10020 Account is suspended' } }, now)?.kind).toBe('provider_account');
  });
  it('shows a 504 timeout cooldown until its timestamp', () => {
    const b = importJobBlock({ status: 'running' }, { waitReason: 'transient_retry', waitUntil: now + 60000, lastError: { status: 504, message: 'TimeoutError' } }, now);
    expect(b?.kind).toBe('cooldown'); expect(b?.until).toBe(now + 60000); expect(b?.title).toContain('504');
  });
  it('is clear once the cooldown passed or the job completed', () => {
    expect(importJobBlock({ status: 'running' }, { waitReason: 'transient_retry', waitUntil: now - 1 }, now)).toBeNull();
    expect(importJobBlock({ status: 'completed' }, { lastError: { status: 407 } }, now)).toBeNull();
  });
});
