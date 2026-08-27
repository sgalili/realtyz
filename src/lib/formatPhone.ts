/**
 * Formats Israeli phone numbers for display.
 *  - Mobiles (05X): "05X-XXXXXXX"  (10 digits, dash after 3)
 *  - Landlines (02/03/04/08/09 and 07X non-mobile): "0X-XXXXXXX"
 *      - 2-digit area codes (02/03/04/08/09): "0X-XXXXXXX" (9 digits, dash after 2)
 *      - 3-digit prefixes (07X like 072/073/074/076/077/079): "0XX-XXXXXXX" (10 digits, dash after 3)
 *  - Accepts inputs in 9725XXXXXXXX / +9725XXXXXXXX / 05XXXXXXXX / 0XXXXXXXX form.
 *  - Returns "-" for null/empty. Returns the original string if it does not look Israeli.
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '-';
  const raw = String(phone).trim();
  if (!raw) return '-';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;

  // Normalize to a local form starting with "0".
  let local = digits;
  if (local.startsWith('972')) local = '0' + local.slice(3);
  else if (!local.startsWith('0')) local = '0' + local;

  // Mobile: 05X-XXXXXXX (10 digits)
  if (/^05\d{8}$/.test(local)) {
    return local.slice(0, 3) + '-' + local.slice(3);
  }

  // 07X virtual / VoIP prefixes: 10 digits, dash after 3
  if (/^07\d{8}$/.test(local)) {
    return local.slice(0, 3) + '-' + local.slice(3);
  }

  // Landlines with 2-digit area code (02/03/04/08/09): 9 digits, dash after 2
  if (/^0[2-489]\d{7}$/.test(local)) {
    return local.slice(0, 2) + '-' + local.slice(2);
  }

  // Short landline (8 digits, area + 6) — still "0X-XXXXXX"
  if (/^0[2-489]\d{6}$/.test(local)) {
    return local.slice(0, 2) + '-' + local.slice(2);
  }

  return raw;
}

/**
 * True only when the input normalizes to a real Israeli mobile/landline.
 * Used to hide garbage values (e.g. Homely serial numbers) from the phone column.
 */
export function isValidIsraeliPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return false;
  let local = digits;
  if (local.startsWith('972')) local = '0' + local.slice(3);
  else if (!local.startsWith('0')) local = '0' + local;
  return /^05\d{8}$/.test(local) || /^07\d{8}$/.test(local) || /^0[2-489]\d{6,7}$/.test(local);
}

/** Canonical global alias — use this everywhere phones are displayed. */
export const formatPhoneNumber = formatPhoneDisplay;

/** Normalizes any Israeli phone input to the E.164-less storage form 9725XXXXXXXX. */
export function normalizePhoneForStorage(phone: string | null | undefined): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return '972' + digits.slice(1);
  return '972' + digits;
}

/**
 * Live formatter for phone INPUT fields — keeps the user's typing inside the
 * strict Israeli display format "05X-XXXXXXX" (landlines: "0X-XXXXXXX").
 * Non-digits are dropped, 972/+972 prefixes are converted to the local form,
 * and a dash is injected automatically at the correct position.
 */
export function formatPhoneAsTyped(input: string | null | undefined): string {
  let digits = String(input ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972')) digits = '0' + digits.slice(3);
  else if (!digits.startsWith('0')) digits = '0' + digits;

  // 05X / 07X mobile & virtual: dash after 3 digits, 10 digits total.
  if (/^0(5|7)/.test(digits)) {
    digits = digits.slice(0, 10);
    return digits.length > 3 ? digits.slice(0, 3) + '-' + digits.slice(3) : digits;
  }
  // Landline area codes: dash after 2 digits, 9 digits total.
  digits = digits.slice(0, 9);
  return digits.length > 2 ? digits.slice(0, 2) + '-' + digits.slice(2) : digits;
}
