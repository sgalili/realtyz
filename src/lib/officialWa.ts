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

/** Clean international digits (Israeli 05X -> 9725X), no '+'. */
export function cleanIntlPhone(phone: string | null | undefined): string {
  let d = String(phone ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '972' + d.slice(1);
  return d;
}

/** Universal https://wa.me/<phone>?text=... link (phone optional for share). */
export function waMeLink(phone?: string | null, text?: string): string {
  const base = `https://wa.me/${cleanIntlPhone(phone)}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** Builds a wa.me link that ALWAYS targets the official WBA number. */
export function officialWaLink(text?: string, phone: string = OFFICIAL_WABA_PHONE): string {
  return waMeLink(phone, text);
}

/**
 * NATIVE deep link to the installed WhatsApp app.
 * Used inside published post text / CTAs so tapping the link jumps straight
 * into the chat instead of landing on WhatsApp's "download" web page.
 */
export function nativeWaLink(phone: string = OFFICIAL_WABA_PHONE, text?: string): string {
  // Universal link: in-app webviews (Facebook/Instagram) hand wa.me to the
  // OS, which opens the installed app; custom schemes fail there.
  return waMeLink(phone, text);
}

/** Opens WhatsApp against the official WBA number only. */
export async function openOfficialWhatsApp(text?: string): Promise<void> {
  const phone = await getOfficialWaNumber();
  window.open(officialWaLink(text, phone), '_blank', 'width=1200,height=800,noopener,noreferrer');
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
  window.open(waMeLink(null, text), '_blank', 'width=1200,height=800,noopener,noreferrer');
}


/**
 * Sends a message to a recipient THROUGH the official WBA gateway
 * (`send-whatsapp` edge function) so the sender identity is always our
 * official number — never a personal device.
 *
 * When `template` is provided the send goes out as a pre-approved Meta
 * template (required for business-initiated messages outside the 24h
 * customer-service window); `message` is kept as a readable preview.
 */
export async function sendViaOfficialWaba(params: {
  phone_number?: string | null;
  lead_id?: string | null;
  message: string;
  template?: { name: string; language: string; components: unknown[] } | null;
}): Promise<{ ok: boolean; error?: string }> {
  const body: Record<string, unknown> = { message: params.message };
  if (params.lead_id) body.lead_id = params.lead_id;
  if (params.phone_number) body.phone_number = params.phone_number;
  if (params.template?.name) {
    body.template_id = params.template.name;
    body.template_language = params.template.language;
    body.template_components = params.template.components;
  }
  try {
    const { data, error } = await supabase.functions.invoke('send-whatsapp', { body });
    if (error) return { ok: false, error: error.message };
    const ok = (data as any)?.success ?? (data as any)?.ok ?? false;
    return ok ? { ok: true } : { ok: false, error: (data as any)?.error || 'שליחה נכשלה' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'שליחה נכשלה' };
  }
}
