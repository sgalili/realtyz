import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { DEMO_CANDIDATES } from '@/lib/demoData';

export type ElectionType = 'national' | 'primaries';

const STORAGE_KEY = 'realtyz-election-type';

export type ElectionTerms = {
  /** Singular unit (עסקה / מושב) */
  seat: string;
  /** Plural units (עסקאות / מושבים) */
  seats: string;
  /** Singular lead (מתעניין / מתפקד) */
  voter: string;
  /** Plural leads (מתעניינים / מתפקדים) */
  voters: string;
  /** "Vote" terminology used in stat cards (קולות / מתפקדים) */
  votes: string;
  /** Verified-supporter pluralization — stays 'תומכים' in both modes */
  supporters: string;
  /** Database / pool label */
  voterBook: string;
  /** Headline target label ("יעד עסקאות" / "יעד מושבים") */
  target: string;
  /** Old field kept for backwards-compat */
  rankingLabel: string;
  /** Mode label ("מכירות ארציות" / "קמפיין פריימריז") */
  electionLabel: string;
  /** How many leads/members are required per unit */
  votesPerUnit: number;
  /** Audience label for "broad public" vs "party members" */
  audience: string;
};

const TERMS: Record<ElectionType, ElectionTerms> = {
  national: {
    seat: 'עסקה',
    seats: 'עסקאות',
    voter: 'מתעניין',
    voters: 'מתעניינים',
    votes: 'קולות',
    supporters: 'תומכים',
    voterBook: 'ספר המתעניינים',
    target: 'יעד עסקאות',
    rankingLabel: 'עסקאות מובטחים',
    electionLabel: 'מכירות ארציות',
    votesPerUnit: 38_000,
    audience: 'כלל הציבור',
  },
  primaries: {
    seat: 'מושב',
    seats: 'מושבים',
    voter: 'מתפקד',
    voters: 'מתפקדים',
    votes: 'מתפקדים',
    // 'תומכים' = verified supporters; same word in both modes (different from
    // 'מתפקדים' which counts party-member registrations).
    supporters: 'תומכים',
    voterBook: 'מאגר המתפקדים',
    target: 'יעד מושבים',
    rankingLabel: 'דירוג ברשימה',
    electionLabel: 'קמפיין פריימריז',
    votesPerUnit: 2_500,
    audience: 'מתפקדי המפלגה',
  },
};

interface ElectionTypeContextValue {
  type: ElectionType;
  setType: (t: ElectionType) => void;
  terms: ElectionTerms;
  /** Quick helper to fetch a single label by key */
  term: <K extends keyof ElectionTerms>(key: K) => ElectionTerms[K];
}

const ElectionTypeContext = createContext<ElectionTypeContextValue | undefined>(undefined);

export function ElectionTypeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { isDemoMode, demoCandidateId } = useDemoMode();
  const [type, setTypeState] = useState<ElectionType>(() => {
    if (typeof window === 'undefined') return 'national';
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'primaries' || stored === 'national' ? stored : 'national';
  });

  useEffect(() => {
    if (isDemoMode && demoCandidateId) {
      const candidate = DEMO_CANDIDATES.find((item) => item.id === demoCandidateId);
      const nextType = candidate?.electionType ?? 'national';
      setTypeState(nextType);
      window.localStorage.setItem(STORAGE_KEY, nextType);
      return;
    }
    if (!user?.id) {
      setTypeState('national');
      window.localStorage.setItem(STORAGE_KEY, 'national');
      return;
    }
    let cancelled = false;

    supabase
      .from('onboarding_state')
      .select('election_type')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const nextType = data?.election_type === 'primaries' ? 'primaries' : 'national';
        setTypeState(nextType);
        try {
          window.localStorage.setItem(STORAGE_KEY, nextType);
        } catch {
          /* ignore */
        }
      });

    return () => { cancelled = true; };
  }, [user?.id, isDemoMode, demoCandidateId]);

  const setType = (next: ElectionType) => {
    setTypeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const value = useMemo<ElectionTypeContextValue>(() => {
    const terms = TERMS[type];
    return {
      type,
      setType,
      terms,
      term: (key) => terms[key],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  return <ElectionTypeContext.Provider value={value}>{children}</ElectionTypeContext.Provider>;
}

export function useElectionType(): ElectionTypeContextValue {
  const ctx = useContext(ElectionTypeContext);
  if (!ctx) {
    // Safe fallback so consumers never crash if used outside provider
    return {
      type: 'national',
      setType: () => {},
      terms: TERMS.national,
      term: (key) => TERMS.national[key],
    };
  }
  return ctx;
}
