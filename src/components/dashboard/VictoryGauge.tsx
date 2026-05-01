import { useEffect, useState } from 'react';
import { useElectionType } from '@/hooks/useElectionType';

interface VictoryGaugeProps {
  /** 0 - 100 success probability */
  value: number;
  /** Optional override label for the central caption */
  label?: string;
  size?: number;
}

/**
 * Strategic Victory gauge - half-donut with success-probability gradient.
 * Mirrors the Strategic Victory Planner gauge from the landing page.
 *   < 40   → red
 *   40-69  → amber
 *   70-89  → gold
 *   ≥ 90   → emerald
 */
export function VictoryGauge({ value, label, size = 220 }: VictoryGaugeProps) {
  const { terms } = useElectionType();
  const safeValue = Math.max(0, Math.min(100, value));
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(safeValue), 80);
    return () => clearTimeout(t);
  }, [safeValue]);

  const radius = (size - 24) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = Math.PI * radius;
  const offset = circumference - (animated / 100) * circumference;

  // Use HSL semantic tokens (Realtyz palette) instead of raw hex.
  const tier =
    safeValue >= 90
      ? { color: 'hsl(var(--success))', glow: 'hsl(var(--success) / 0.45)', text: 'נעילת ניצחון' }
      : safeValue >= 70
      ? { color: 'hsl(var(--brand-blue))', glow: 'hsl(var(--brand-blue) / 0.45)', text: 'מסלול ניצחון' }
      : safeValue >= 40
      ? { color: 'hsl(var(--warning))', glow: 'hsl(var(--warning) / 0.40)', text: 'דורש פעולה' }
      : { color: 'hsl(var(--destructive))', glow: 'hsl(var(--destructive) / 0.40)', text: 'סיכון גבוה' };

  return (
    <div className="flex flex-col items-center" dir="rtl">
      <svg width={size} height={size / 2 + 28} className="overflow-visible">
        <defs>
          <linearGradient id="victory-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(var(--destructive))" />
            <stop offset="40%" stopColor="hsl(var(--warning))" />
            <stop offset="70%" stopColor="hsl(var(--brand-blue))" />
            <stop offset="100%" stopColor="hsl(var(--success))" />
          </linearGradient>
        </defs>

        {/* Background arc */}
        <path
          d={`M ${12} ${cy} A ${radius} ${radius} 0 0 1 ${size - 12} ${cy}`}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={14}
          strokeLinecap="round"
          opacity={0.35}
        />
        {/* Glow */}
        <path
          d={`M ${12} ${cy} A ${radius} ${radius} 0 0 1 ${size - 12} ${cy}`}
          fill="none"
          stroke={tier.color}
          strokeWidth={22}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          opacity={0.2}
          className="transition-all duration-1000 ease-out"
        />
        {/* Value arc - rainbow gradient masked by current value */}
        <path
          d={`M ${12} ${cy} A ${radius} ${radius} 0 0 1 ${size - 12} ${cy}`}
          fill="none"
          stroke="url(#victory-grad)"
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 0 10px ${tier.glow})` }}
        />

        {/* Center % */}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          className="font-black"
          style={{ fontSize: size / 4.2, fill: tier.color, letterSpacing: '-0.02em' }}
        >
          {Math.round(animated)}%
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          className="fill-muted-foreground font-medium"
          style={{ fontSize: 11 }}
        >
          {label ?? `הסתברות לעמידה ב${terms.target}`}
        </text>
      </svg>
      <div
        className="mt-1 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold"
        style={{
          borderColor: tier.color,
          background: tier.glow,
          color: tier.color,
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: tier.color }} />
        {tier.text}
      </div>
    </div>
  );
}
