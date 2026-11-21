/**
 * Full-screen professional confetti burst used after a successful
 * post generation / scheduling run.
 */
import confetti from 'canvas-confetti';

const BRAND_COLORS = ['#0b3982', '#1877f2', '#f5c542', '#ffffff', '#25d366'];

export function celebrate(durationMs = 2200): void {
  try {
    const end = Date.now() + durationMs;
    // A single full-screen canvas on top of everything.
    const shoot = () => {
      confetti({
        particleCount: 60,
        spread: 70,
        startVelocity: 45,
        origin: { x: Math.random() * 0.4, y: Math.random() * 0.3 + 0.1 },
        colors: BRAND_COLORS,
        zIndex: 99999,
        disableForReducedMotion: true,
      });
      confetti({
        particleCount: 60,
        spread: 70,
        startVelocity: 45,
        origin: { x: 1 - Math.random() * 0.4, y: Math.random() * 0.3 + 0.1 },
        colors: BRAND_COLORS,
        zIndex: 99999,
        disableForReducedMotion: true,
      });
      if (Date.now() < end) setTimeout(shoot, 260);
    };
    shoot();
  } catch {
    /* confetti is purely decorative */
  }
}

/** Natural 7-second shower: pieces burst from the top edge and fall to the bottom until all are gone. */
export function celebrateFromTop(totalMs = 7000): void {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const fall = 3200; // emission stops early so the last pieces finish falling by totalMs
    const end = Date.now() + Math.max(500, totalMs - fall);
    const ticks = Math.round(fall / 16.7 * 1.1);
    const shoot = () => {
      confetti({ particleCount: 14, angle: 270, spread: 140, startVelocity: 12, gravity: 0.9, drift: (Math.random() - 0.5) * 1.2, decay: 0.94, scalar: 1.05, ticks, origin: { x: Math.random(), y: -0.05 }, colors: BRAND_COLORS, zIndex: 99999 });
      if (Date.now() < end) setTimeout(shoot, 120);
    };
    shoot();
  } catch { /* decorative */ }
}
