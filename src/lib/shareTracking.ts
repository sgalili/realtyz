// Tags TORAFF links with utm_source/utm_medium for the channel they are shared
// through, so analytics can tell WhatsApp, Facebook, email and copied-link
// visits apart instead of lumping them into "Direct". Only our own domains are
// tagged; external links (wa.me, facebook.com posts) are left untouched.
export type ShareChannel = 'whatsapp' | 'facebook' | 'email' | 'sms' | 'copy';

const UTM: Record<ShareChannel, { source: string; medium: string }> = {
  whatsapp: { source: 'whatsapp', medium: 'social' },
  facebook: { source: 'facebook', medium: 'social' },
  email: { source: 'email', medium: 'email' },
  sms: { source: 'sms', medium: 'sms' },
  copy: { source: 'copy_link', medium: 'share' },
};

const OWN_HOST = /^(?:www\.)?(?:toraff|realtyz)\.co\.il$/i;

export function withShareUtm(url: string, channel: ShareChannel): string {
  try {
    const parsed = new URL(url);
    if (!OWN_HOST.test(parsed.hostname)) return url;
    if (parsed.searchParams.has('utm_source')) return url;
    parsed.searchParams.set('utm_source', UTM[channel].source);
    parsed.searchParams.set('utm_medium', UTM[channel].medium);
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Tags every TORAFF link found inside a free-text share message. */
export function tagShareText(text: string, channel: ShareChannel): string {
  return text.replace(/https?:\/\/(?:www\.)?(?:toraff|realtyz)\.co\.il[^\s<>"')\]]*/gi, (m) => withShareUtm(m, channel));
}
