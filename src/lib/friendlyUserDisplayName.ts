type AuthUserLike = {
  email?: string | null;
  phone?: string | null;
  user_metadata?: Record<string, unknown> | null;
} | null | undefined;

const isSyntheticWhatsAppEmail = (value: string) =>
  /@(?:whatsapp\.)?realtyz\.local$/i.test(value.trim());

export function friendlyUserDisplayName(user: AuthUserLike, fallback = 'ללא שם'): string {
  const meta = user?.user_metadata ?? {};
  const named = [meta.full_name, meta.name, meta.display_name]
    .find((value) => typeof value === 'string' && value.trim()) as string | undefined;
  if (named) return named.trim();
  const email = String(user?.email ?? '').trim();
  if (email && !isSyntheticWhatsAppEmail(email)) return email;
  const phone = String(user?.phone ?? '').trim();
  return phone || fallback;
}