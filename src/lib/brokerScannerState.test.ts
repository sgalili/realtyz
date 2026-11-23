import { describe, expect, it } from 'vitest';
import { scannerBlockReason, scannerWorkerState } from './brokerScannerState';

const now = Date.parse('2026-11-23T14:30:00Z');
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

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
