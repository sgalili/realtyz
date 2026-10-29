export function certificateNameMatches(certificateName: string, registryName: string) {
  // Only outer whitespace is ignored: no fuzzy matching, reordered names or punctuation removal.
  return certificateName.trim().length > 0 && certificateName.trim() === registryName.trim();
}

export const CERTIFICATE_MAX_BYTES = 5 * 1024 * 1024;
export const CERTIFICATE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];