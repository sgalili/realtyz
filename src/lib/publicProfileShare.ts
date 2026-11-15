import { waMeLink } from '@/lib/officialWa';
import { publicUrl } from '@/lib/publicUrl';

export function publicProfileShare(path: string, title: string) {
  const url = publicUrl(path);
  const text = `${title} ב־TORAFF`;
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
