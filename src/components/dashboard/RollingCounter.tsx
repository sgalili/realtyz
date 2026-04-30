import { useEffect, useRef, useState } from 'react';
import { Users } from 'lucide-react';

interface Props {
  target: number;
  label: string;
}

export function RollingCounter({ target, label }: Props) {
  const [display, setDisplay] = useState(0);
  const animRef = useRef<number>();
  const startRef = useRef(0);
  const prevRef = useRef(0);

  useEffect(() => {
    if (target === prevRef.current) return;
    const from = prevRef.current;
    prevRef.current = target;
    startRef.current = performance.now();
    const duration = Math.min(2000, Math.max(800, Math.abs(target - from) / 100));

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (t < 1) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [target]);

  const formatted = display.toLocaleString('en-US');
  const chars = formatted.split('');

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium tracking-wider uppercase">
        <Users className="h-4 w-4" />
        {label}
      </div>
      <div className="flex items-center gap-[2px]" dir="ltr">
        {chars.map((char, i) => (
          <span
            key={`${i}-${char}`}
            className={
              char === ','
                ? 'text-3xl sm:text-5xl font-bold text-muted-foreground/50 mx-0.5'
                : 'text-4xl sm:text-6xl font-black tabular-nums text-foreground bg-muted/30 rounded-md px-1.5 py-0.5 border border-border/30 inline-flex items-center justify-center min-w-[1.6rem] sm:min-w-[2.4rem] animate-scale-in'
            }
          >
            {char}
          </span>
        ))}
      </div>
    </div>
  );
}
