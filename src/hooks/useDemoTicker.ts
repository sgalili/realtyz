import { useState, useEffect, useRef } from 'react';
import { useDemoMode } from './useDemoMode';
import { DEMO_SUMMARY } from '@/lib/demoData';

export function useDemoTicker() {
  const { isDemoMode } = useDemoMode();
  const [bonus, setBonus] = useState({ voters: 0, supporters: 0, touchpoints: 0, sent: 0, clicks: 0 });
  const [pulse, setPulse] = useState(0); // 0-1 value that spikes on each tick
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!isDemoMode) {
      setBonus({ voters: 0, supporters: 0, touchpoints: 0, sent: 0, clicks: 0 });
      setPulse(0);
      return;
    }

    intervalRef.current = setInterval(() => {
      const voterInc = Math.floor(Math.random() * 13) + 1;
      const supporterInc = Math.floor(Math.random() * 13) + 1;
      const touchpointInc = Math.floor(Math.random() * 180) + 70;
      const sentInc = Math.floor(touchpointInc * 0.78);
      const clickInc = Math.floor(touchpointInc * 0.22);
      setBonus(prev => ({
        voters: prev.voters + voterInc,
        supporters: prev.supporters + supporterInc,
        touchpoints: prev.touchpoints + touchpointInc,
        sent: prev.sent + sentInc,
        clicks: prev.clicks + clickInc,
      }));
      // Spike pulse to 1, then decay
      setPulse(1);
      setTimeout(() => setPulse(0.5), 1500);
      setTimeout(() => setPulse(0), 3000);
    }, 5000);

    return () => clearInterval(intervalRef.current);
  }, [isDemoMode]);

  return {
    totalVoters: DEMO_SUMMARY.totalVoters + bonus.voters,
    supporters: DEMO_SUMMARY.supporters + bonus.supporters,
    touchpoints: 184_730 + bonus.touchpoints,
    sentBonus: bonus.sent,
    clickBonus: bonus.clicks,
    pulse, // 0-1 intensity for map glow
  };
}
