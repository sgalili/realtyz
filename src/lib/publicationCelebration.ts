import confetti from 'canvas-confetti';

// Resume during the explicit publishing click, before asynchronous uploads.
export function preparePublicationSound(): AudioContext | null {
  try {
    const context = new AudioContext();
    void context.resume().catch(() => {});
    return context;
  } catch { return null; }
}

export function celebratePublication(audio: AudioContext | null): void {
  const duration = 5000;
  const canvas = document.createElement('canvas');
  canvas.className = 'pointer-events-none fixed inset-0 z-[99999] h-full w-full';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const burst = confetti.create(canvas, { resize: true });
  const tokens = getComputedStyle(document.documentElement);
  const sample = document.createElement('canvas');
  sample.width = 1; sample.height = 1;
  const sampler = sample.getContext('2d');
  const colors = ['--primary', '--success', '--sale', '--background'].flatMap(token => {
    if (!sampler) return [];
    sampler.fillStyle = `hsl(${tokens.getPropertyValue(token).trim()})`;
    sampler.fillRect(0, 0, 1, 1);
    const rgb = sampler.getImageData(0, 0, 1, 1).data;
    return [`#${Array.from(rgb).slice(0, 3).map(value => value.toString(16).padStart(2, '0')).join('')}`];
  });
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const started = performance.now();
  let frame = 0;
  let lastBurst = -100;
  const draw = (now: number) => {
    if (now - started >= duration) return;
    if (!reduced && now - lastBurst > 90) {
      lastBurst = now;
      void burst({ particleCount: 12, angle: 270, spread: 100, startVelocity: 5, gravity: 0.8, ticks: 160, origin: { x: Math.random(), y: 0 }, colors, disableForReducedMotion: true });
    }
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
  if (audio?.state === 'running') {
    try {
      for (let index = 0; index < 16; index++) {
        const time = audio.currentTime + index * 0.3;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = [523.25, 659.25, 783.99, 1046.5][index % 4];
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.06, time + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
        oscillator.connect(gain); gain.connect(audio.destination);
        oscillator.start(time); oscillator.stop(time + 0.26);
      }
    } catch { /* Audio must never affect the successful publication. */ }
  }
  window.setTimeout(() => {
    cancelAnimationFrame(frame); burst.reset(); canvas.remove();
    void audio?.close().catch(() => {});
  }, duration);
}