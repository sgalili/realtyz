import confetti from 'canvas-confetti';
import signupSound from '@/assets/sounds/signup-celebration.mp3.asset.json';
import earningsSound from '@/assets/sounds/earnings-coins.mp3.asset.json';

export const SIGNUP_CELEBRATION_MS = 7000;
export const EARNING_TYPES = ['affiliate_lead_reward', 'closing_commission_payout', 'referral_reward'] as const;
export function isEarnedCredit(row: { type: string; amount_ils: number }) {
  return Number.isFinite(Number(row.amount_ils)) && Number(row.amount_ils) > 0 && EARNING_TYPES.some(type => type === row.type);
}
let context: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer>>();
function load(url: string) {
  if (!context) return;
  const audio = context;
  if (!buffers.has(url)) buffers.set(url, fetch(url).then(response => {
    if (!response.ok) throw new Error('Sound unavailable');
    return response.arrayBuffer();
  }).then(bytes => audio.decodeAudioData(bytes)));
  return buffers.get(url);
}
/** Called on a real gesture: browsers do not permit sound before interaction. */
export function prepareRewardSounds() {
  try {
    context ??= new AudioContext();
    void context.resume().catch(() => {});
    for (const url of [signupSound.url, earningsSound.url]) void load(url)?.catch(() => {});
  } catch { /* Feedback cannot interrupt signup or rewards. */ }
}
export async function playRewardSound(kind: 'signup' | 'earnings') {
  const url = kind === 'signup' ? signupSound.url : earningsSound.url;
  try {
    if (context?.state === 'running') {
      const buffer = await load(url);
      if (!buffer || !context) return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      gain.gain.value = 0.55;
      source.buffer = buffer; source.connect(gain); gain.connect(context.destination);
      source.start();
    } else {
      const audio = new Audio(url); audio.volume = 0.55;
      await audio.play();
    }
  } catch { /* Autoplay restrictions are respected, never queue an old reward. */ }
}

export function celebrateSignup(): () => void {
  void playRewardSound('signup');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const canvas = document.createElement('canvas');
  canvas.className = 'pointer-events-none fixed inset-0 z-[99999] h-full w-full';
  canvas.setAttribute('aria-hidden', 'true'); canvas.dataset.signupConfetti = 'true';
  document.body.appendChild(canvas);
  const shoot = confetti.create(canvas, { resize: true });
  const styles = getComputedStyle(document.documentElement);
  const sample = document.createElement('canvas').getContext('2d');
  const colors = ['--primary', '--success', '--warning', '--lead-phone', '--destructive'].flatMap(token => {
    if (!sample) return [];
    sample.fillStyle = `hsl(${styles.getPropertyValue(token).trim()})`;
    sample.fillRect(0, 0, 1, 1);
    return [`#${Array.from(sample.getImageData(0, 0, 1, 1).data).slice(0, 3).map(value => value.toString(16).padStart(2, '0')).join('')}`];
  });
  const started = performance.now();
  let frame = 0, last = -100;
  const draw = (now: number) => {
    const elapsed = now - started;
    // Emit early, leave the final seconds for paper to fall past the bottom.
    if (elapsed < 4500 && now - last > 95) {
      last = now;
      void shoot({ particleCount: 10, origin: { x: Math.random(), y: -0.03 }, angle: 270,
        spread: 75, startVelocity: 9, gravity: Math.max(0.8, window.innerHeight / 800),
        decay: 0.97, drift: (Math.random() - 0.5) * 0.6, ticks: 240,
        scalar: 0.8 + Math.random() * 0.5, shapes: ['square'], colors,
        disableForReducedMotion: true });
    }
    if (elapsed < SIGNUP_CELEBRATION_MS) frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
  const stop = () => { cancelAnimationFrame(frame); shoot.reset(); canvas.remove(); };
  const timer = window.setTimeout(stop, SIGNUP_CELEBRATION_MS);
  return () => { window.clearTimeout(timer); stop(); };
}