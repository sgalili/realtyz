export function certificateNameMatches(certificateName: string, registryName: string) {
  // Only outer whitespace is ignored: no fuzzy matching, reordered names or punctuation removal.
  return certificateName.trim().length > 0 && certificateName.trim() === registryName.trim();
}

export const CERTIFICATE_MAX_BYTES = 5 * 1024 * 1024;
export const CERTIFICATE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Completed document/registry comparisons are validation results, never function failures. */
export function certificateRegistryResponse(licenseNumber: string, fullName: string, registryName: string | null) {
  const matched = registryName !== null && certificateNameMatches(fullName, registryName);
  const code = matched ? 'matched' : registryName === null ? 'license_not_found' : 'name_mismatch';
  const message = matched
    ? 'פרטי התעודה תואמים לפנקס המתווכים וקבצי האימות הועברו בצורה מאובטחת לבדיקה.'
    : registryName === null ? 'מספר הרישיון שבתעודה לא נמצא בפנקס המתווכים המורשים.'
    : 'השם בתעודה אינו זהה לשם בפנקס המתווכים. יש לבדוק את התעודה ולהעלות צילום ברור.';
  return { status: 200, body: { matched, code, licenseNumber, fullName, registryName, message } };
}