/**
 * Circular determinate progress ring that renders ONLY the percentage value
 * inside the ring — no labels, no text. Used for property metadata hydration
 * and gallery loading.
 */
interface ProgressRingProps {
  /** 0-100 */
  value: number;
  /** Outer diameter in px. */
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Render on a dark scrim (inverts colors to white). */
  onDark?: boolean;
}

export function ProgressRing({
  value,
  size = 72,
  strokeWidth = 6,
  className,
  onDark = false,
}: ProgressRingProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  return (
    <span
      className={`relative inline-flex items-center justify-center ${className ?? ''}`}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className={onDark ? 'stroke-white/25' : 'stroke-muted'}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={onDark ? 'stroke-white' : 'stroke-primary'}
          style={{ transition: 'stroke-dashoffset 220ms linear' }}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center font-bold tabular-nums ${
          onDark ? 'text-white' : 'text-primary'
        }`}
        style={{ fontSize: Math.round(size * 0.26) }}
      >
        {pct}
      </span>
    </span>
  );
}
