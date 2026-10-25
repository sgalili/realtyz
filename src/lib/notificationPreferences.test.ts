import { describe, expect, it } from 'vitest';
import { channelsForEvent, withinQuietHours, allowsNotificationOverride, notificationIsQuiet, quietWeekFromPreferences, quietWeekValid } from '../../supabase/functions/_shared/notificationPreferences';
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
  it('applies global hours to all seven days and retains individual overrides', () => {
    const weekly = quietWeekFromPreferences({ quiet_hours_start: '22:00:00', quiet_hours_end: '07:00:00' });
    expect(Object.values(weekly)).toHaveLength(7);
    expect(Object.values(weekly).every(day => day.start === '22:00' && day.end === '07:00')).toBe(true);
    weekly['1'] = { enabled: true, start: '12:00', end: '14:00' };
    expect(notificationIsQuiet({ quiet_hours_weekly: weekly }, new Date('2026-10-26T13:00:00Z'))).toBe(true);
    expect(notificationIsQuiet({ quiet_hours_weekly: weekly }, new Date('2026-10-27T13:00:00Z'))).toBe(false);
  });
  it('suppresses only selected weekdays', () => {
    const pref = { quiet_hours_weekly: { '0': { enabled: true, start: '12:00', end: '14:00' } } };
    expect(notificationIsQuiet(pref, new Date('2026-10-25T13:00:00Z'))).toBe(true);
    expect(notificationIsQuiet(pref, new Date('2026-10-26T13:00:00Z'))).toBe(false);
  });
  it('carries overnight quiet hours into the following day and handles week rollover', () => {
    const pref = { quiet_hours_weekly: { '6': { enabled: true, start: '22:00', end: '07:00' } } };
    expect(notificationIsQuiet(pref, new Date('2026-10-24T22:00:00Z'))).toBe(true);
    expect(notificationIsQuiet(pref, new Date('2026-10-25T06:59:00Z'))).toBe(true);
    expect(notificationIsQuiet(pref, new Date('2026-10-25T07:00:00Z'))).toBe(false);
    expect(notificationIsQuiet(pref, new Date('2026-10-24T06:00:00Z'))).toBe(false);
  });
  it('does not fall back to global hours when weekly selection is empty', () => {
    expect(notificationIsQuiet({ quiet_hours_weekly: {}, quiet_hours_start: '22:00', quiet_hours_end: '07:00' }, new Date('2026-10-25T23:00:00Z'))).toBe(false);
  });
  it('requires distinct valid start/end times for enabled days only', () => {
    expect(quietWeekValid({ '0': { enabled: true, start: '22:00', end: '' } })).toBe(false);
    expect(quietWeekValid({ '0': { enabled: true, start: '22:00', end: '22:00' } })).toBe(false);
    expect(quietWeekValid({ '0': { enabled: false, start: '', end: '' } })).toBe(true);
  });
});