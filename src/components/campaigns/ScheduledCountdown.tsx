import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

/**
 * Strict dd/hh/mm/ss countdown to a scheduled broadcast. No labels, no wording —
 * just the remaining days/hours/minutes/seconds, ticking every second.
 */
export function ScheduledCountdown({ iso, className }: { iso: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(t);
  }, []);

  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return null;
  const diff = Math.max(0, target - now);
  const pad = (n: number) => String(n).padStart(2, '0');
  const countdown = [
    Math.floor(diff / 86_400_000),
    Math.floor((diff % 86_400_000) / 3_600_000),
    Math.floor((diff % 3_600_000) / 60_000),
    Math.floor((diff % 60_000) / 1_000),
  ].map(pad).join('/');

  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs ${className ?? ''}`} dir="rtl">
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold tabular-nums text-primary" dir="ltr">
        <Clock className="h-3 w-3" />
        {countdown}
      </span>
    </div>
  );
}

export default ScheduledCountdown;
