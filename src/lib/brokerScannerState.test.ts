import { describe, expect, it } from 'vitest';
import { scannerBlockReason, scannerWorkerState } from './brokerScannerState';
import { scannerDelayReason, scannerFailureReason } from './brokerScannerState';

const now = Date.parse('2026-11-23T14:30:00Z');
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

describe('read-only queue diagnostics', () => {
  const s = { enabled: true, paused: false, connected: true, webhook_ready: true, worker_seen_at: iso(10000), daily_cap: 20, used_today: 6 };
  it('distinguishes quota exhaustion from an active serial reply wait', () => {
    expect(scannerDelayReason({ ...s, used_today: 20 }, now)).toBe('המכסה היומית מוצתה. המשך לאחר חצות בישראל');
    expect(scannerDelayReason({ ...s, outstanding_until: new Date(now + 7200000).toISOString() }, now)).toBeNull();
  });
  it('reports connection and pacing separately without changing the settings', () => {
    expect(scannerDelayReason({ ...s, connected: false }, now)).toBe('קו הוואטסאפ מנותק');
    expect(scannerDelayReason({ ...s, next_send_at: new Date(now + 45000).toISOString() }, now)).toBe('השהיה בטוחה בין פניות');
    expect(s.used_today).toBe(6);
  });
  it('keeps unknown-send and missing-correlation reasons distinct', () => {
    expect(scannerFailureReason('reply_timeout_or_unknown_send')).toBe('לא התקבלה תשובה בזמן או שתוצאת השליחה אינה ודאית. נדרשת בדיקה ידנית, ללא שליחה חוזרת אוטומטית');
    expect(scannerFailureReason('missing_message_correlation')).toBe('התקבלה תשובה שלא ניתן לשייך בבטחה למתווך. המספר לא נשמר');
  });
});

describe('scanner worker state', () => {
  it('is connected when the worker checked in within two minutes', () => {
    expect(scannerWorkerState({ enabled: true, paused: false, worker_seen_at: iso(30_000) }, now)).toBe('connected');
  });
  it('reports a rejected key when the latest worker call was refused', () => {
    expect(scannerWorkerState({ enabled: true, paused: false, worker_seen_at: iso(3_600_000), worker_rejected_at: iso(60_000) }, now)).toBe('rejected');
  });
  it('is silent when the last check-in is older than two minutes', () => {
    expect(scannerWorkerState({ enabled: true, paused: false, worker_seen_at: iso(180_000) }, now)).toBe('silent');
  });
  it('a paused line blocks discovery even with a connected worker', () => {
    expect(scannerBlockReason({ enabled: true, paused: true, worker_seen_at: iso(10_000) }, now)).toBe('קו הסריקה מושהה');
  });
  it('an active line with a connected worker is not blocked', () => {
    expect(scannerBlockReason({ enabled: true, paused: false, worker_seen_at: iso(10_000) }, now)).toBeNull();
  });
});

import { scannerEta as eta, formatCountdown as fmt } from './brokerScannerState';
describe('scanner countdown', () => {
  const base = { daily_cap: 15, jitter_min_seconds: 45, jitter_max_seconds: 180, next_send_at: null, used_today: 0 };
  it('sends immediately when quota allows and nothing is ahead', () => { expect(eta({ ...base, queue_ahead: 0 }, 1000)).toBe(1000); });
  it('waits for pacing of jobs ahead', () => { expect(eta({ ...base, queue_ahead: 2 }, 0)).toBe(225000); });
  it('respects next_send_at pacing', () => { expect(eta({ ...base, queue_ahead: 0, next_send_at: new Date(60000).toISOString() }, 0)).toBe(60000); });
  it('waits for the serial line outstanding reply deadline', () => { expect(eta({ ...base, queue_ahead: 0, outstanding_until: new Date(7200000).toISOString() }, 0)).toBe(7200000); });
  it('a timestamp anchored at receipt decreases by one second rather than moving with now', () => { const target = eta({ ...base, queue_ahead: 1 }, 1000); expect(fmt(target - 1000)).toBe('00:01:52'); expect(fmt(target - 2000)).toBe('00:01:51'); expect(fmt(target - 61000)).toBe('00:00:52'); });
  it('moves past quota to a later day', () => { expect(eta({ ...base, used_today: 15, queue_ahead: 0 }, 0)).toBeGreaterThan(0); });
  it('formats days only when applicable', () => { expect(fmt(3723000)).toBe('01:02:03'); expect(fmt(90061000)).toBe('1 יום 01:01:01'); });
});
