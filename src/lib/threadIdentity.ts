// Unified conversation identity.
// A single person may exist as several rows (duplicate CRM contacts, an
// orphan phone-anchored thread, a social profile thread). The inbox must show
// ONE row per person, so every thread is reduced to a stable identity key:
// phone -> email -> social profile id -> normalized name.

export function normalizePhoneKey(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 7) return null;
  // Compare on the national significant part so 0546811841 / 972546811841 /
  // +972-54-681-1841 all collapse to the same identity.
  return digits.slice(-9);
}

export function normalizeNameKey(raw?: string | null): string | null {
  if (!raw) return null;
  const name = String(raw).replace(/\s+/g, ' ').trim().toLowerCase();
  return name.length >= 2 ? name : null;
}

export type ThreadLike = {
  id: string;
  full_name?: string | null;
  phone_number?: string | null;
  email?: string | null;
  facebook_id?: string | null;
  instagram_id?: string | null;
  social_profile_id?: string | null;
  metadata?: any;
};

/** Stable identity key used to merge multiple threads of the same person. */
export function threadIdentityKey(v: ThreadLike): string {
  const phone = normalizePhoneKey(v.phone_number ?? v.metadata?.sender_phone);
  if (phone) return `p:${phone}`;

  const email = v.email ? String(v.email).trim().toLowerCase() : '';
  if (email.includes('@')) return `e:${email}`;

  const social =
    v.social_profile_id ||
    v.facebook_id ||
    v.instagram_id ||
    v.metadata?.sender_id ||
    v.metadata?.psid ||
    v.metadata?.social_profile_id;
  if (social) return `s:${String(social).trim().toLowerCase()}`;

  const name = normalizeNameKey(v.full_name);
  if (name) return `n:${name}`;

  return `id:${v.id}`;
}
