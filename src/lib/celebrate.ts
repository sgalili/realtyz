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
