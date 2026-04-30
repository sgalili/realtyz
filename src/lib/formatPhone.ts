/**
 * Formats an international phone number (9725XXXXXXXX) to local Israeli display format (05X-XXXXXXX).
 * If the number doesn't match the expected pattern, returns it as-is.
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '-';
  const cleaned = phone.replace(/\D/g, '');

  // 9725XXXXXXXX → 05X-XXXXXXX
  if (cleaned.startsWith('972') && cleaned.length >= 12) {
    const local = '0' + cleaned.slice(3); // e.g. 9725XXXXXXXX → 05XXXXXXXX
    return local.slice(0, 3) + '-' + local.slice(3);
  }

  // Already local format 05XXXXXXXX
  if (cleaned.startsWith('05') && cleaned.length === 10) {
    return cleaned.slice(0, 3) + '-' + cleaned.slice(3);
  }

  return phone;
}
