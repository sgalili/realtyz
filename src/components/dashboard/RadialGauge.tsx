import { useEffect, useState } from 'react';

interface RadialGaugeProps {
  value: number; // 0-100
  label: string;
  color: string; // hsl color
  size?: number;
}

export function RadialGauge({ value, label, color, size = 120 }: RadialGaugeProps) {
  const [animatedValue, setAnimatedValue] = useState(0);
  const radius = (size - 16) / 2;
  const circumference = Math.PI * radius; // semi-circle
  const strokeDashoffset = circumference - (animatedValue / 100) * circumference;

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedValue(value), 100);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size / 2 + 16} className="overflow-visible">
        {/* Background arc */}
        <path
          d={`M ${8} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 8} ${size / 2}`}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Glow behind value arc */}
        <path
          d={`M ${8} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 8} ${size / 2}`}
          fill="none"
          stroke={color}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          opacity="0.15"
          className="transition-all duration-1000 ease-out"
        />
        {/* Value arc */}
        <path
          d={`M ${8} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 8} ${size / 2}`}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
        />
        {/* Value text */}
        <text
          x={size / 2}
          y={size / 2 - 4}
          textAnchor="middle"
          className="fill-foreground text-xl font-bold"
          style={{ fontSize: size / 5 }}
        >
          {animatedValue}%
        </text>
      </svg>
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
    </div>
  );
}
