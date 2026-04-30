import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  className?: string;
  duration?: number;
}

/**
 * Slot-machine style number transition. Animates each digit independently
 * by sliding through 0-9 to land on the target digit.
 */
export function SlotNumber({ value, className, duration = 900 }: Props) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (value === display) return;
    const from = fromRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(from + (value - from) * eased);
      setDisplay(current);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const sign = display < 0 ? '-' : '';
  const abs = Math.abs(Math.round(display));
  const formatted = abs.toLocaleString('en-US');

  return (
    <span className={className} dir="ltr">
      {sign}
      {formatted.split('').map((ch, i) =>
        /\d/.test(ch) ? (
          <SlotDigit key={`${formatted.length}-${i}`} digit={Number(ch)} />
        ) : (
          <span key={`s-${i}`}>{ch}</span>
        )
      )}
    </span>
  );
}

function SlotDigit({ digit }: { digit: number }) {
  // Render a fixed-height window that translates to the target digit row.
  return (
    <span
      className="inline-block overflow-hidden align-baseline tabular-nums"
      style={{ height: '1em', lineHeight: '1em', verticalAlign: '-0.05em' }}
    >
      <span
        className="flex flex-col transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ transform: `translateY(-${digit}em)` }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <span key={d} style={{ height: '1em', lineHeight: '1em' }}>
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}
