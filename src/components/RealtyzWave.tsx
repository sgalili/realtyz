import { useEffect, useRef } from 'react';

/**
 * RealtyzWave - JS-driven dual-sine animated wave divider.
 *
 * Renders an SVG <path> whose `d` attribute is recalculated every frame
 * (requestAnimationFrame) as the sum of two sine waves with seeded
 * frequency/phase. This produces the continuous, non-repeating water-like
 * motion seen on realtyz.co.il (impossible with pure CSS keyframes).
 *
 * Usage:
 *   <RealtyzWave variant="bottom" fill="hsl(var(--background))" seed={1} />
 */

export type RealtyzWaveVariant = 'wave' | 'wave-deep' | 'wave-soft' | 'wave-jagged';

interface Props {
  /** Position of the wave relative to its container */
  position?: 'top' | 'bottom';
  /** Mirror horizontally */
  reverse?: boolean;
  /** Visual style preset (controls amplitude + height) */
  variant?: RealtyzWaveVariant;
  /** Fill (CSS color) or 'gradient' to use built-in silver gradient */
  fill?: string;
  /** Override height in px */
  height?: number;
  /** Random seed - different seeds give different rhythms */
  seed?: number;
  /** Optional className for outer container */
  className?: string;
  /** Optional drop-shadow */
  glow?: boolean;
  /** Pixel offset from top/bottom edge (default -1) */
  offset?: number;
}

const VARIANT_CONFIG: Record<RealtyzWaveVariant, { height: number; amp: number }> = {
  'wave': { height: 32, amp: 0.45 },
  'wave-deep': { height: 44, amp: 0.63 },
  'wave-soft': { height: 26, amp: 0.31 },
  'wave-jagged': { height: 38, amp: 0.53 },
};

const VBW = 100;
const VBH = 100;
const SAMPLES = 60;

function rand(seed: number, salt: number) {
  const x = Math.sin(seed * 9999 + salt * 31) * 10000;
  return x - Math.floor(x);
}

export function RealtyzWave({
  position = 'bottom',
  reverse = false,
  variant = 'wave',
  fill = 'hsl(var(--background))',
  height,
  seed = 1,
  className,
  glow = false,
  offset = -1,
}: Props) {
  const pathRef = useRef<SVGPathElement | null>(null);
  const config = VARIANT_CONFIG[variant];
  const finalHeight = height ?? config.height;
  const amp = config.amp;

  useEffect(() => {
    const pathEl = pathRef.current;
    if (!pathEl) return;

    // Respect reduced motion
    const reduced = typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const w = {
      f1: 0.9 + rand(seed, 1) * 0.7,
      f2: 1.7 + rand(seed, 2) * 1.1,
      a1: 0.55 + rand(seed, 3) * 0.20,
      a2: 0.25 + rand(seed, 4) * 0.20,
      p1: rand(seed, 5) * Math.PI * 2,
      p2: rand(seed, 6) * Math.PI * 2,
      s1: 0.55 + rand(seed, 7) * 0.45,
      s2: 0.35 + rand(seed, 8) * 0.35,
    };

    let raf = 0;
    const start = performance.now();

    const build = (now: number) => {
      const t = reduced ? 0 : (now - start) / 1000;
      const baseY = VBH * 0.5;
      const maxHalf = VBH * 0.5 - 4;
      const reqHalf = amp * VBH * (w.a1 + w.a2);
      const scale = reqHalf > 0 ? Math.min(1, maxHalf / reqHalf) : 1;
      const a1 = amp * VBH * w.a1 * scale;
      const a2 = amp * VBH * w.a2 * scale;
      const ph1 = w.p1 + t * w.s1;
      const ph2 = w.p2 + t * w.s2;
      let d = '';
      for (let i = 0; i <= SAMPLES; i++) {
        const x = (i / SAMPLES) * VBW;
        const u = (x / VBW) * Math.PI * 2;
        const y = baseY + a1 * Math.sin(u * w.f1 + ph1) + a2 * Math.sin(u * w.f2 + ph2);
        d += (i === 0 ? 'M' : ' L') + x.toFixed(2) + ',' + y.toFixed(2);
      }
      d += ` L${VBW},${VBH + 6} L0,${VBH + 6} Z`;
      pathEl.setAttribute('d', d);
      if (!reduced) raf = requestAnimationFrame(build);
    };

    raf = requestAnimationFrame(build);
    return () => cancelAnimationFrame(raf);
  }, [seed, amp]);

  const isGradient = fill === 'gradient';
  const gradientId = `realtyz-wave-grad-${seed}-${position}`;

  return (
    <div
      aria-hidden
      className={className}
      style={{
        position: 'absolute',
        insetInline: 0,
        [position]: offset,
        height: finalHeight,
        width: '100%',
        pointerEvents: 'none',
        transform: [
          position === 'top' ? 'rotate(180deg)' : '',
          reverse ? 'scaleX(-1)' : '',
        ].filter(Boolean).join(' ') || undefined,
        zIndex: 1,
        filter: glow ? 'drop-shadow(0 -8px 16px hsl(var(--brand-blue) / 0.18))' : undefined,
      }}
    >
      <svg
        viewBox={`0 0 ${VBW} ${VBH}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        {isGradient && (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="55%" stopColor="#c9d4ec" />
              <stop offset="100%" stopColor="#8aa3d9" />
            </linearGradient>
          </defs>
        )}
        <path ref={pathRef} d="" fill={isGradient ? `url(#${gradientId})` : fill} />
      </svg>
    </div>
  );
}
