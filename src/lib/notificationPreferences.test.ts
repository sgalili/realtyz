import { describe, expect, it } from 'vitest';
import { channelsForEvent, withinQuietHours, allowsNotificationOverride } from '../../supabase/functions/_shared/notificationPreferences';
describe('notification delivery preferences', () => {
  it('delivers only selected channels per event', () => {
    const preferences = { event_channels: { meeting_booked: ['sms', 'email'], critical_question: [] } };
    expect(channelsForEvent(preferences, 'meeting_booked')).toEqual(['sms', 'email']);
    expect(channelsForEvent(preferences, 'critical_question')).toEqual([]);
  });
  it('keeps historical defaults without treating email metadata as consent', () => {
    expect(channelsForEvent({ delivery_channel: 'email' }, 'new_high_priority')).toEqual(['whatsapp']);
  });
  it('respects overnight quiet hours and excludes the end minute', () => {
    expect(withinQuietHours('22:00', '07:00', new Date('2026-10-25T06:59:00Z'))).toBe(true);
    expect(withinQuietHours('22:00', '07:00', new Date('2026-10-25T07:00:00Z'))).toBe(false);
  });
  it('rejects recipient override by ordinary callers', () => {
    expect(allowsNotificationOverride('Bearer user', 'server', 'other-user')).toBe(false);
    expect(allowsNotificationOverride('Bearer server', 'server', 'other-user')).toBe(true);
  });
});