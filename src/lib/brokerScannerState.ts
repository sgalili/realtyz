/** Plain-language scanner line and Railway worker state for the Super Admin card and broker rows. */
export type ScannerWorkerFields = { enabled: boolean; paused: boolean; worker_seen_at?: string | null; worker_rejected_at?: string | null };

const FRESH_MS = 2 * 60 * 1000;

export type WorkerState = 'connected' | 'rejected' | 'silent';

export function scannerWorkerState(s: ScannerWorkerFields, now = Date.now()): WorkerState {
  const seen = Date.parse(s.worker_seen_at ?? '') || 0;
  const rejected = Date.parse(s.worker_rejected_at ?? '') || 0;
  if (rejected > seen && now - rejected < 10 * 60 * 1000) return 'rejected';
  if (seen && now - seen < FRESH_MS) return 'connected';
  return 'silent';
}

export const workerStateLabels: Record<WorkerState, string> = {
  connected: 'שירות הסריקה מחובר',
  rejected: 'שירות הסריקה נדחה: המפתח ב-Railway אינו תואם',
  silent: 'שירות הסריקה לא דיווח לאחרונה',
};

/** Why a queued discovery is not moving yet, or null when it should be progressing. */
export function scannerBlockReason(s: ScannerWorkerFields, now = Date.now()): string | null {
  if (!s.enabled || s.paused) return 'קו הסריקה מושהה';
  const w = scannerWorkerState(s, now);
  return w === 'connected' ? null : workerStateLabels[w];
}
