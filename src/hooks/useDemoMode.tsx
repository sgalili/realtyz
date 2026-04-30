import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { DEMO_EXIT_PENDING_KEY, requestDemoAuth } from '@/lib/demoGuard';
import { DEMO_CANDIDATES, type DemoCandidateId } from '@/lib/demoData';

interface DemoModeContextType {
  isDemoMode: boolean;
  setDemoMode: (v: boolean) => void;
  demoCandidateId: DemoCandidateId | null;
  setDemoCandidateId: (id: DemoCandidateId) => void;
}

const DemoModeContext = createContext<DemoModeContextType>({ isDemoMode: false, setDemoMode: () => {}, demoCandidateId: null, setDemoCandidateId: () => {} });
const STORAGE_KEY = 'kalpiz-demo-mode';
const CANDIDATE_STORAGE_KEY = 'kalpiz-demo-candidate';

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [isDemoMode, setDemoMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    // URL ?demo=true forces demo on first load (works on /auth and any public route).
    const urlForcedDemo = new URLSearchParams(window.location.search).get('demo') === 'true';
    if (urlForcedDemo) {
      window.localStorage.setItem(STORAGE_KEY, 'true');
      return true;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  });
  const [demoCandidateId, setCandidateState] = useState<DemoCandidateId | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = window.localStorage.getItem(CANDIDATE_STORAGE_KEY) as DemoCandidateId | null;
    return DEMO_CANDIDATES.some((candidate) => candidate.id === stored) ? stored : null;
  });

  // Detect ?demo=true on subsequent client-side navigations as well.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleUrlChange = () => {
      if (new URLSearchParams(window.location.search).get('demo') === 'true' && !isDemoMode) {
        setDemoMode(true);
      }
    };
    window.addEventListener('popstate', handleUrlChange);
    return () => window.removeEventListener('popstate', handleUrlChange);
  }, [isDemoMode]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(isDemoMode));
  }, [isDemoMode]);

  useEffect(() => {
    if (!loading && !user) {
      // Don't re-enable demo if user explicitly turned it off (exit pending = headed to /auth).
      if (window.localStorage.getItem(DEMO_EXIT_PENDING_KEY) === 'true') return;
      setDemoMode(true);
    }
  }, [loading, user]);

  useEffect(() => {
    if (!loading && user && window.localStorage.getItem(DEMO_EXIT_PENDING_KEY) === 'true') {
      setDemoMode(false);
    }
  }, [loading, user]);

  const handleSetDemoMode = (value: boolean) => {
    if (!value) {
      // Always redirect to /auth when turning demo off, no popup.
      window.localStorage.setItem(DEMO_EXIT_PENDING_KEY, 'true');
      window.localStorage.setItem(STORAGE_KEY, 'false');
      setDemoMode(false);
      if (typeof window !== 'undefined' && window.location.pathname !== '/auth') {
        window.location.replace('/auth');
      }
      return;
    }
    // Re-prompt for simulation candidate every time demo mode is (re-)entered.
    setCandidateState(null);
    window.localStorage.removeItem(CANDIDATE_STORAGE_KEY);
    window.localStorage.removeItem(DEMO_EXIT_PENDING_KEY);
    setDemoMode(true);
  };

  const setDemoCandidateId = (id: DemoCandidateId) => {
    setCandidateState(id);
    window.localStorage.setItem(CANDIDATE_STORAGE_KEY, id);
  };

  return (
    <DemoModeContext.Provider value={{ isDemoMode, setDemoMode: handleSetDemoMode, demoCandidateId, setDemoCandidateId }}>
      {children}
    </DemoModeContext.Provider>
  );
}

export const useDemoMode = () => useContext(DemoModeContext);
