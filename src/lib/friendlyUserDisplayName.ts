type AuthUserLike = {
  email?: string | null;
  phone?: string | null;
  user_metadata?: Record<string, unknown> | null;
} | null | undefined;

const isSyntheticWhatsAppEmail = (value: string) =>
  /\.(?:local|test|invalid)$/i.test(value.trim()) || /@(?:[a-z0-9-]+\.)*(?:example\.(?:com|org)|placeholder\.[a-z]+)$/i.test(value.trim());

export function friendlyUserDisplayName(user: AuthUserLike, fallback = 'ללא שם'): string {
  const meta = user?.user_metadata ?? {};
  const named = [meta.full_name, meta.name, meta.display_name]
    .find((value) => typeof value === 'string' && value.trim() && !value.includes('@')) as string | undefined;
  if (named) return named.trim();
  // Never fall back to an email address or a phone number: the default display
  // name is always the neutral Hebrew placeholder.
  return fallback;
}

export function isSyntheticEmail(value: string | null | undefined): boolean {
  return !!value && isSyntheticWhatsAppEmail(String(value));
}
