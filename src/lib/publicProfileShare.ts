import { waMeLink } from '@/lib/officialWa';
import { publicUrl } from '@/lib/publicUrl';
import type { PlatformMode } from '@/hooks/usePlatformMode';
import { platformPresentation } from '@/lib/platformPresentation';

export function useNativeProfileShare(mobileWidth: boolean, coarsePointer: boolean, nativeAvailable: boolean) {
  return mobileWidth && coarsePointer && nativeAvailable;
}

export function publicProfileShare(path: string, title: string, mode: PlatformMode = 'full_marketplace') {
  const url = publicUrl(path);
  const presentation = platformPresentation(mode);
  const text = title === 'TORAFF' ? presentation.shareText : mode === 'brokers_only'
    ? `${title} ב־TORAFF, מערכת ההפעלה למתווכי נדל״ן`
    : `${title} ב־TORAFF`;
  const message = `${text}\n${url}`;

  return {
    title,
    text,
    url,
    whatsapp: waMeLink(null, message),
    sms: `sms:?&body=${encodeURIComponent(message)}`,
    email: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(message)}`,
  };
}
