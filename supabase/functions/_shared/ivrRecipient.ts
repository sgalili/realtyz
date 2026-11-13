export function normalizeIvrPhone(raw: string) {
  const digits = raw.trim().replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972')) return '+' + digits;
  if (digits.startsWith('0')) return '+972' + digits.slice(1);
  if (digits.length === 9) return '+972' + digits;
  return '+' + digits;
}
export const validIvrPhone = (phone: string) => /^\+\d{9,15}$/.test(phone);
export type IvrRecipient = { id?: string; phone: string };
type LeadResult = { id?: string; phone?: string; error?: string };
export async function resolveIvrRecipient(recipient: IvrRecipient, lookup: (id: string | undefined, variants: string[]) => Promise<LeadResult>, create: (digits: string) => Promise<LeadResult>) {
  const phone = normalizeIvrPhone(recipient.phone);
  if (!validIvrPhone(phone)) return { phone, error: 'invalid_phone' };
  const digits = phone.slice(1);
  const variants = [digits, phone, digits.startsWith('972') ? '0' + digits.slice(3) : digits];
  const existing = await lookup(recipient.id, variants);
  if (existing.error) return { phone, error: 'lead_lookup_failed' };
  if (existing.id) {
    if (normalizeIvrPhone(existing.phone ?? '') !== phone) return { phone, error: 'lead_phone_mismatch' };
    return { id: existing.id, phone };
  }
  if (recipient.id) return { phone, error: 'lead_not_in_workspace' };
  const created = await create(digits);
  if (created.error || !created.id) return { phone, error: 'lead_creation_failed' };
  return { id: created.id, phone };
}