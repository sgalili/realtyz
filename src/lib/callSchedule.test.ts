import { describe, expect, it } from 'vitest';
import { callReminderAt, validateFutureCall } from './callSchedule';

describe('future calls', () => {
  it('rejects past or current call times', () => {
    const now = Date.parse('2026-10-25T10:00:00Z');
    expect(validateFutureCall('2026-10-25T09:00:00Z', 'lead', now)).not.toBeNull();
    expect(validateFutureCall('2026-10-25T10:00:00Z', 'lead', now)).not.toBeNull();
    expect(validateFutureCall('2026-10-25T11:00:00Z', 'lead', now)).toBeNull();
  });
  it('requires a linked lead', () => {
    expect(validateFutureCall('2026-10-25T11:00:00Z', null, Date.parse('2026-10-25T10:00:00Z'))).not.toBeNull();
  });
  it('sets reminder before call and immediately if booked within an hour', () => {
    expect(callReminderAt('2026-10-25T12:00:00Z', '2026-10-25T10:00:00Z')).toBe('2026-10-25T11:00:00.000Z');
    expect(callReminderAt('2026-10-25T10:30:00Z', '2026-10-25T10:00:00Z')).toBe('2026-10-25T10:00:00.000Z');
  });
});