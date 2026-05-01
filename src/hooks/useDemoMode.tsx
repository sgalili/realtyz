/**
 * Demo Mode — Context Switcher
 *
 * Demo Mode is a pure client-side context flag. It does NOT swap auth users.
 * When ON, components that branch on `isDemoMode` will render demo datasets
 * (see `src/lib/demoData.ts`) instead of querying the real database.
 *
 * Persisted in localStorage so the choice survives refreshes.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DemoCandidateId } from '@/lib/demoData';
import { toast as sonnerToast } from 'sonner';

const STORAGE_KEY = 'realtyz-demo-mode';
const CANDIDATE_KEY = 'realtyz-demo-candidate';

type DemoModeContextValue = {
  isDemoMode: boolean;
  setDemoMode: (v: boolean) => void;
  demoCandidateId: DemoCandidateId | null;
  setDemoCandidateId: (id: DemoCandidateId | null) => void;
};

const DemoModeContext = createContext<DemoModeContextValue | null>(null);

function readBool(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function readCandidate(): DemoCandidateId | null {
  try {
    const raw = window.localStorage.getItem(CANDIDATE_KEY);
    return (raw as DemoCandidateId) || null;
  } catch {
    return null;
  }
}

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => readBool(STORAGE_KEY));
  const [demoCandidateId, setDemoCandidate] = useState<DemoCandidateId | null>(() => readCandidate());

  const setDemoMode = useCallback((v: boolean) => {
    try { window.localStorage.setItem(STORAGE_KEY, v ? 'true' : 'false'); } catch {}
    setIsDemoMode(v);
  }, []);

  const setDemoCandidateId = useCallback((id: DemoCandidateId | null) => {
    try {
      if (id) window.localStorage.setItem(CANDIDATE_KEY, id);
      else window.localStorage.removeItem(CANDIDATE_KEY);
    } catch {}
    setDemoCandidate(id);
  }, []);

  // Sync across tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setIsDemoMode(e.newValue === 'true');
      if (e.key === CANDIDATE_KEY) setDemoCandidate((e.newValue as DemoCandidateId) || null);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo(
    () => ({ isDemoMode, setDemoMode, demoCandidateId, setDemoCandidateId }),
    [isDemoMode, setDemoMode, demoCandidateId, setDemoCandidateId],
  );

  return <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>;
}

export function useDemoMode(): DemoModeContextValue {
  const ctx = useContext(DemoModeContext);
  if (ctx) return ctx;
  // Safe fallback if used outside provider (shouldn't happen in app, but guards tests).
  return {
    isDemoMode: false,
    setDemoMode: () => {},
    demoCandidateId: null,
    setDemoCandidateId: () => {},
  };
}
