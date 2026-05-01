import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { deriveQuota, DerivedQuota } from '@/lib/quotaCalculator';
import { useDemoMode } from '@/hooks/useDemoMode';

const STORAGE_KEY_REAL = 'realtyz-selected-transactions-real';
const STORAGE_KEY_DEMO = 'realtyz-selected-transactions-demo';
const LEGACY_STORAGE_KEY = 'realtyz-selected-transactions';
const DEFAULT_MANDATES_REAL = 3; // Current plan default for real accounts
const DEFAULT_MANDATES_DEMO = 3;
const MIN_MANDATES = 1;
const MAX_MANDATES = 120;

interface MandateContextValue {
  selectedMandates: number;
  setSelectedMandates: (n: number) => void;
  increment: () => void;
  decrement: () => void;
  quota: DerivedQuota;
  min: number;
  max: number;
}

const MandateContext = createContext<MandateContextValue | null>(null);

const readStored = (key: string, fallback: number): number => {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed >= MIN_MANDATES && parsed <= MAX_MANDATES) return parsed;
  return fallback;
};

export function MandateProvider({ children }: { children: ReactNode }) {
  const { isDemoMode } = useDemoMode();

  // Migrate legacy single-key value into the demo bucket (where the slider used to live).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy != null && window.localStorage.getItem(STORAGE_KEY_DEMO) == null) {
      window.localStorage.setItem(STORAGE_KEY_DEMO, legacy);
    }
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  }, []);

  const [realMandates, setRealMandates] = useState<number>(() =>
    readStored(STORAGE_KEY_REAL, DEFAULT_MANDATES_REAL),
  );
  const [demoMandates, setDemoMandates] = useState<number>(() =>
    readStored(STORAGE_KEY_DEMO, DEFAULT_MANDATES_DEMO),
  );

  // Re-sync from storage when mode flips, so each environment shows its own saved value.
  useEffect(() => {
    if (isDemoMode) {
      setDemoMandates(readStored(STORAGE_KEY_DEMO, DEFAULT_MANDATES_DEMO));
    } else {
      setRealMandates(readStored(STORAGE_KEY_REAL, DEFAULT_MANDATES_REAL));
    }
  }, [isDemoMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY_REAL, String(realMandates));
  }, [realMandates]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY_DEMO, String(demoMandates));
  }, [demoMandates]);

  const selectedMandates = isDemoMode ? demoMandates : realMandates;
  const setMandates = isDemoMode ? setDemoMandates : setRealMandates;

  const setSelectedMandates = useCallback((n: number) => {
    const clamped = Math.min(MAX_MANDATES, Math.max(MIN_MANDATES, Math.floor(n)));
    setMandates(clamped);
  }, [setMandates]);

  const increment = useCallback(() => {
    setMandates((prev) => Math.min(MAX_MANDATES, prev + 1));
  }, [setMandates]);

  const decrement = useCallback(() => {
    setMandates((prev) => Math.max(MIN_MANDATES, prev - 1));
  }, [setMandates]);

  const quota = useMemo(() => deriveQuota(selectedMandates), [selectedMandates]);

  const value = useMemo<MandateContextValue>(() => ({
    selectedMandates,
    setSelectedMandates,
    increment,
    decrement,
    quota,
    min: MIN_MANDATES,
    max: MAX_MANDATES,
  }), [selectedMandates, setSelectedMandates, increment, decrement, quota]);

  return <MandateContext.Provider value={value}>{children}</MandateContext.Provider>;
}

export function useMandate() {
  const ctx = useContext(MandateContext);
  if (!ctx) throw new Error('useMandate must be used within MandateProvider');
  return ctx;
}
