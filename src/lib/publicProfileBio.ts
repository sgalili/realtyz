export function publicProfileBio(custom: string | null | undefined, imported?: string | null): string | null {
  const text = custom?.trim() ?? '';
  return text.length >= 50 ? text : imported?.trim() || null;
}