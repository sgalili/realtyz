import { campaignServiceEstimate, type CampaignPrice } from './campaignServicePricing';

export function ivrDurationSeconds(seconds: number | null | undefined): number | null {
  return seconds != null && Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

export function formatIvrDuration(seconds: number | null | undefined): string {
  const duration = ivrDurationSeconds(seconds);
  if (duration == null) return '--:--';
  return `${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}`;
}

// Conservative to the next second; retain the configured proportional minute pricing.
export function ivrMaximumEstimate(prices: CampaignPrice[], recipients: number, seconds: number | null | undefined, includeWhatsapp: boolean) {
  const duration = ivrDurationSeconds(seconds);
  if (duration == null) return null;
  const ivr = campaignServiceEstimate('ivr', prices, recipients, duration).total;
  const whatsapp = includeWhatsapp ? campaignServiceEstimate('whatsapp', prices, recipients).total : 0;
  return ivr != null && whatsapp != null ? Number((ivr + whatsapp).toFixed(6)) : null;
}

export async function readIvrAudioDuration(url: string): Promise<number | null> {
  const metadata = await new Promise<number | null>(resolve => {
    const audio = new Audio();
    const finish = (duration: number | null) => {
      window.clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute('src');
      audio.load();
      resolve(duration);
    };
    const timer = window.setTimeout(() => finish(null), 5000);
    audio.onloadedmetadata = () => finish(ivrDurationSeconds(audio.duration));
    audio.onerror = () => finish(null);
    audio.src = url;
  });
  if (metadata != null) return metadata;
  // MediaRecorder WebM files may report infinite metadata duration.
  const context = new AudioContext();
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    return ivrDurationSeconds(buffer.duration);
  } catch {
    return null;
  } finally {
    await context.close();
  }
}