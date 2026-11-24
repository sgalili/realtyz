import { describe, expect, it } from 'vitest';
import { BROKER_CALL_DELAY_MS, BROKER_DEMO_MAX_SECONDS, canOverrideDemoCall, outreachReply, brokerVoiceIntro } from './brokerOutreachPolicy';
describe('broker outreach rules', () => {
  it('waits exactly 60 seconds after OTP', () => expect(BROKER_CALL_DELAY_MS).toBe(60_000));
  it('bounds the short demo to 90 seconds', () => expect(BROKER_DEMO_MAX_SECONDS).toBe(90));
  it('accepts explicit interest, not an ambiguous reply', () => {
    expect(outreachReply('מעוניינת')).toBe('positive');
    expect(outreachReply('כן אבל לא רוצה')).toBe('unknown');
  });
  it('opt-out prevents progression', () => expect(outreachReply('לא מעוניין')).toBe('opt_out'));
  it('cannot override a claimed call or one at the deadline', () => {
    expect(canOverrideDemoCall('pending','2026-11-24T12:01:00Z',Date.parse('2026-11-24T12:00:59Z'))).toBe(true);
    expect(canOverrideDemoCall('pending','2026-11-24T12:01:00Z',Date.parse('2026-11-24T12:01:00Z'))).toBe(false);
    expect(canOverrideDemoCall('dispatching','2026-11-24T12:01:00Z',Date.parse('2026-11-24T12:00:00Z'))).toBe(false);
  });
  it('never promises draft properties when none were saved', () => expect(brokerVoiceIntro('דנה כהן','female',0)).not.toContain('טיוטות הנכסים'));
});