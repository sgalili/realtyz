import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

/**
 * Live Hebrew countdown to a scheduled broadcast, alongside the exact date and
 * time the post goes out.
 */
export function ScheduledCountdown({ iso, className }: { iso: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return null;
  const diff = Math.max(0, target - now);
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const countdown = diff === 0
    ? 'משוגר עכשיו'
    : days > 0
      ? `בעוד ${days} ימים ו-${hours} שעות`
      : `בעוד ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  const exact = new Date(target).toLocaleString('he-IL', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs ${className ?? ''}`} dir="rtl">
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold tabular-nums text-primary">
        <Clock className="h-3 w-3" />
        {countdown}
      </span>
      <span className="text-muted-foreground">{exact}</span>
    </div>
  );
}

export default ScheduledCountdown;
