/**
 * officialWa
 * ----------
 * SINGLE SOURCE OF TRUTH for outbound WhatsApp identity.
 *
 * HARD RULE: the app may only ever open / use the official Meta WhatsApp
 * Business (WBA) number. Personal WhatsApp numbers, broker numbers and any
 * Green API instance number are forbidden everywhere (share flows, landing
 * pages, property pages, client portal, dashboard actions).
 */
import { supabase } from '@/integrations/supabase/client';

/** Fallback used when the DB lookup is unavailable. */
export const OFFICIAL_WABA_PHONE = '972537983832';

let cached: string | null = null;

/** Resolves the official WABA number (digits only, E.164 without '+'). */
export async function getOfficialWaNumber(): Promise<string> {
  if (cached) return cached;
  try {
    const { data } = await supabase
      .from('wa_providers' as never)
      .select('config')
      .eq('is_official', true)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    const cfg = ((data as any)?.config ?? {}) as Record<string, unknown>;
    const digits = String(cfg.display_phone_number ?? cfg.phone_number ?? '').replace(/\D/g, '');
    if (digits.length >= 9) {
      cached = digits;
      return cached;
    }
  } catch {
    /* fall through to the constant */
  }
  cached = OFFICIAL_WABA_PHONE;
  return cached;
}

/** Builds a wa.me link that ALWAYS targets the official WBA number. */
export function officialWaLink(text?: string, phone: string = OFFICIAL_WABA_PHONE): string {
  const base = `https://wa.me/${phone.replace(/\D/g, '')}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** Opens WhatsApp against the official WBA number only. */
export async function openOfficialWhatsApp(text?: string): Promise<void> {
  const phone = await getOfficialWaNumber();
  window.open(officialWaLink(text, phone), '_blank', 'noopener,noreferrer');
}

/**
 * Opens the NATIVE WhatsApp app straight on its contact-picker with the text
 * pre-filled (no recipient in the URL), so the broker chooses whom to send to
 * from their real WhatsApp contacts list.
 *
 * No phone number is placed in the link, so this never introduces a
 * non-official sender identity: it is the device's own WhatsApp share sheet.
 */
export function openWhatsAppContactPicker(text: string): void {
  const encoded = encodeURIComponent(text);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isMobile) {
    // Native protocol: opens the installed app directly on the contact list.
    window.location.href = `whatsapp://send?text=${encoded}`;
    // Safety net for devices without the custom scheme registered.
    setTimeout(() => {
      window.location.href = `https://api.whatsapp.com/send?text=${encoded}`;
    }, 700);
    return;
  }
  // Desktop: api.whatsapp.com hands off to WhatsApp Desktop / Web with the
  // contact selection list open.
  window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank', 'noopener,noreferrer');
}


/**
 * Sends a message to a recipient THROUGH the official WBA gateway
 * (`send-whatsapp` edge function) so the sender identity is always our
 * official number — never a personal device.
 */
export async function sendViaOfficialWaba(params: {
  phone_number?: string | null;
  lead_id?: string | null;
  message: string;
}): Promise<{ ok: boolean; error?: string }> {
  const body: Record<string, unknown> = { message: params.message };
  if (params.lead_id) body.lead_id = params.lead_id;
  if (params.phone_number) body.phone_number = params.phone_number;
  try {
    const { data, error } = await supabase.functions.invoke('send-whatsapp', { body });
    if (error) return { ok: false, error: error.message };
    const ok = (data as any)?.success ?? (data as any)?.ok ?? false;
    return ok ? { ok: true } : { ok: false, error: (data as any)?.error || 'שליחה נכשלה' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'שליחה נכשלה' };
  }
}
