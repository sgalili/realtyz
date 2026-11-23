import { normalizeBrokerWhatsApp, primaryListing } from './brokerWhatsApp.ts';

export const scannerDefaults = { daily_cap: 15, jitter_min_seconds: 45, jitter_max_seconds: 180, start_hour: 9, end_hour: 18, error_threshold: 3 };
export const yad2InquiryPhone = '972559895695';

/** This destination is an inquiry service, NEVER a broker contact. No fabricated message. */
export function extractYad2Inquiry(html: string, sourceUrl: string) {
  const { $, main, scopeError } = primaryListing(html, sourceUrl);
  if (scopeError) return { inquiry: null, reason: scopeError };
  const matches = new Map<string, { target_phone: string; prefilled_message: string }>();
  for (const element of main.find('a[href]').toArray()) {
    try {
      const url = new URL(($(element).attr('href') ?? '').replace(/&amp;/g, '&'));
      if (url.protocol !== 'https:' || url.username || url.password) continue;
      const raw = url.hostname === 'wa.me' ? url.pathname.slice(1)
        : url.hostname === 'api.whatsapp.com' && url.pathname === '/send' ? url.searchParams.get('phone') : null;
      const target = raw ? normalizeBrokerWhatsApp(raw) : null;
      const text = url.searchParams.get('text');
      // Only the observed central Yad2 inquiry action may receive scanner messages.
      if (target !== yad2InquiryPhone || !text?.trim() || text.length > 4000) continue;
      matches.set(`${target}:${text}`, { target_phone: target, prefilled_message: text });
    } catch { /* A malformed link is not an inquiry. */ }
  }
  return { inquiry: matches.size === 1 ? [...matches.values()][0] : null,
    reason: matches.size === 1 ? 'source_prefilled_inquiry' : matches.size ? 'ambiguous_inquiry' : 'no_prefilled_inquiry' };
}

/** Parse only the reply text, never quoted original text or sender number. */
export function replyContact(text: string, excluded: string[]) {
  const candidates = new Set<string>();
  for (const raw of text.match(/https:\/\/(?:wa\.me\/[^\s<>"']+|api\.whatsapp\.com\/send\?[^\s<>"']+)/gi) ?? []) {
    try {
      const url = new URL(raw.replace(/[),.;]+$/, '').replace(/&amp;/g, '&'));
      const phone = normalizeBrokerWhatsApp(url.hostname === 'wa.me' ? url.pathname.slice(1) : url.searchParams.get('phone') ?? '');
      if (phone) candidates.add(phone);
    } catch { /* Reject malformed links. */ }
  }
  for (const raw of text.match(/(?<![\dA-Za-z])(?:\+?972[\s.-]?5\d|05\d)[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g) ?? []) {
    const phone = normalizeBrokerWhatsApp(raw);
    if (phone) candidates.add(phone);
  }
  for (const phone of [...excluded, yad2InquiryPhone]) candidates.delete(phone);
  return { phone: candidates.size === 1 ? [...candidates][0] : null,
    reason: candidates.size === 1 ? 'unique_reply_contact' : candidates.size ? 'ambiguous_reply_contacts' : 'no_personal_number' };
}

export function scannerReply(payload: Record<string, any>) {
  const message = payload.messageData ?? {};
  const extended = message.extendedTextMessageData ?? {};
  return {
    // Business senders like Yad2 may use template/button formats instead of plain text.
    text: String(message.textMessageData?.textMessage ?? extended.text ?? message.templateMessageData?.contentText
      ?? message.buttonsMessage?.contentText ?? message.interactiveButtons?.contentText ?? ''),
    quoted_id: String(message.quotedMessage?.stanzaId ?? extended.stanzaId ?? ''),
    chat_id: String(payload.senderData?.chatId ?? ''),
    sender: String(payload.senderData?.sender ?? ''),
  };
}

export function scannerJitter(min: number, max: number, random = Math.random) {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 45 || max > 600 || max < min) throw new Error('invalid_jitter');
  return min + Math.floor(Math.min(0.999999999, Math.max(0, random())) * (max - min + 1));
}