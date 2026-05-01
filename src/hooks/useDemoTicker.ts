/**
 * Demo Mode has been removed. The ticker is now a stable no-op so any
 * remaining call-site renders zero deltas without animating.
 */
import { DEMO_SUMMARY } from '@/lib/demoData';

export function useDemoTicker() {
  return {
    totalVoters: DEMO_SUMMARY.totalVoters,
    supporters: DEMO_SUMMARY.supporters,
    touchpoints: 184_730,
    sentBonus: 0,
    clickBonus: 0,
    pulse: 0,
  };
}
