import { useSyncExternalStore } from 'react';

/**
 * Module-level Yad2 agency import job. Lives outside React so the import keeps
 * running after its window closes; any screen can subscribe to its progress.
 */
export type Yad2ImportPhase = 'idle' | 'discovering' | 'importing' | 'done';
export type Yad2ImportJob = {
  phase: Yad2ImportPhase;
  workspaceId: string | null;
  total: number; done: number; failed: number; running: number;
  imported: string[];
  types: string[];
  startedAt: number;
  /** Estimated completion timestamp (ms). */
  etaAt: number | null;
  /** Set once the post-import commission window has been shown. */
  commissionPrompted?: boolean;
};

export const DISCOVERY_ESTIMATE_MS = 30_000;
export const DEFAULT_ITEM_MS = 20_000;

const empty = (): Yad2ImportJob => ({ phase: 'idle', workspaceId: null, total: 0, done: 0, failed: 0, running: 0, imported: [], types: [], startedAt: 0, etaAt: null });
let state = empty();
let runId = 0;
const listeners = new Set<() => void>();

export const getYad2ImportJob = () => state;
export function setYad2ImportJob(patch: Partial<Yad2ImportJob> | ((s: Yad2ImportJob) => Partial<Yad2ImportJob>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach(l => l());
}
export const resetYad2ImportJob = () => { runId++; state = empty(); listeners.forEach(l => l()); };
/** Claims the one-time post-import commission prompt; true only for the first caller. */
export function claimYad2CommissionPrompt(workspaceId: string | null) {
  if (state.phase !== 'done' || state.commissionPrompted || !state.imported.length || state.workspaceId !== workspaceId) return false;
  state = { ...state, commissionPrompted: true }; listeners.forEach(l => l());
  return true;
}
export const nextYad2ImportRun = () => ++runId;
export const currentYad2ImportRun = () => runId;

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useYad2ImportJob = () => useSyncExternalStore(subscribe, getYad2ImportJob, getYad2ImportJob);

/** Remaining-time estimate from observed per-item durations and parallelism. */
export function estimateRemainingMs(pending: number, parallel: number, avgItemMs: number) {
  if (pending <= 0) return 0;
  return Math.ceil(pending / Math.max(1, parallel)) * Math.max(1000, avgItemMs);
}

export function formatCountdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
