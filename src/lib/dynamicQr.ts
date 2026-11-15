import { publicUrl } from '@/lib/publicUrl';

export const DYNAMIC_QR_PATH = '/go';
export const DEFAULT_DYNAMIC_QR_DESTINATION = publicUrl('/');

export function dynamicQrPublicUrl() {
  return publicUrl(DYNAMIC_QR_PATH);
}

/** Only absolute web URLs are valid, and the QR must never redirect to itself. */
export function normalizeDynamicQrDestination(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) throw new Error('יש להזין כתובת URL תקינה של עד 2,048 תווים');
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('יש להזין כתובת URL מלאה הכוללת https://');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('היעד חייב להיות כתובת HTTP או HTTPS ציבורית ללא פרטי התחברות');
  }
  const redirect = new URL(dynamicQrPublicUrl());
  if (url.origin === redirect.origin && (url.pathname === DYNAMIC_QR_PATH || url.pathname === `${DYNAMIC_QR_PATH}/`)) {
    throw new Error('יעד ה-QR לא יכול להיות קישור ההפניה עצמו');
  }
  return url.toString();
}

export function safeDynamicQrDestination(value: unknown) {
  try {
    return typeof value === 'string' ? normalizeDynamicQrDestination(value) : DEFAULT_DYNAMIC_QR_DESTINATION;
  } catch {
    return DEFAULT_DYNAMIC_QR_DESTINATION;
  }
}
