import { toast } from 'sonner';

let audioCtx: AudioContext | null = null;
/** Short, soft two-tone "ding" generated in the browser (no audio file needed). */
export function playSoftDing() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    const ctx = audioCtx;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + i * 0.09;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  } catch { /* audio is optional */ }
}

/** Groups notifications per source: count arriving messages and keep one card per chat. */
export function groupedNotificationCounts(prev: Record<string, number>, sourceKey: string, added: number) {
  return { ...prev, [sourceKey]: (prev[sourceKey] ?? 0) + added };
}

export function showGroupedChatNotification(sourceKey: string, title: string, count: number, preview?: string | null, onOpen?: () => void) {
  toast(title, {
    id: `community-${sourceKey}`,
    description: `${count > 1 ? `${count} הודעות חדשות` : 'הודעה חדשה'}${preview ? ` · ${preview.slice(0, 80)}` : ''}`,
    action: onOpen ? { label: 'פתיחה', onClick: onOpen } : undefined,
    duration: 8000,
  });
}
