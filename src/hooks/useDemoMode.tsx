/**
 * Demo Mode has been removed (production-only mode).
 *
 * This file is kept as a no-op compatibility stub so the many call-sites that
 * still reference `useDemoMode()` / `<DemoModeProvider>` continue to compile
 * and naturally take the production code path (`isDemoMode === false`).
 *
 * Do NOT add new imports of this hook. New code should not branch on demo state.
 */
import type { ReactNode } from 'react';
import type { DemoCandidateId } from '@/lib/demoData';

export function DemoModeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export const useDemoMode = (): {
  isDemoMode: false;
  setDemoMode: (v: boolean) => void;
  demoCandidateId: DemoCandidateId | null;
  setDemoCandidateId: (id: DemoCandidateId) => void;
} => ({
  isDemoMode: false,
  setDemoMode: () => {},
  demoCandidateId: null,
  setDemoCandidateId: () => {},
});
