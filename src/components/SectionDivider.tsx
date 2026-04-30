import { cn } from '@/lib/utils';
import { KalpizWave } from '@/components/KalpizWave';

interface Props {
  className?: string;
  /** Tone - controls wave fill color */
  tone?: 'gold' | 'navy' | 'silver' | 'background';
  /** Position the wave relative to its parent section */
  position?: 'top' | 'bottom';
  /** Visual preset */
  variant?: 'wave' | 'wave-deep' | 'wave-soft' | 'wave-jagged';
  /** Mirror horizontally */
  reverse?: boolean;
  /** Random seed for unique rhythm */
  seed?: number;
}

const TONE_FILL: Record<NonNullable<Props['tone']>, string> = {
  gold: 'hsl(46 78% 58%)',
  navy: 'hsl(var(--brand-navy))',
  silver: 'gradient',
  background: 'hsl(var(--background))',
};

/**
 * Branded JS-driven wave divider used to separate sections.
 * Uses dual-sine procedural animation matching kalpiz.co.il.
 */
export function SectionDivider({
  className,
  tone = 'background',
  position = 'bottom',
  variant = 'wave',
  reverse = false,
  seed = 5,
}: Props) {
  return (
    <div
      role="separator"
      aria-hidden
      className={cn('relative w-full select-none', className)}
      style={{ height: 32 }}
    >
      <KalpizWave
        position={position}
        reverse={reverse}
        variant={variant}
        fill={TONE_FILL[tone]}
        seed={seed}
      />
    </div>
  );
}
