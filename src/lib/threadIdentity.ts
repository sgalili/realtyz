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
  instagram_psid?: string | null;
  instagram_handle?: string | null;
  messenger_id?: string | null;
  messenger_psid?: string | null;
  telegram_username?: string | null;
  social_profile_id?: string | null;
  metadata?: any;
};

const clean = (v: unknown): string | null => {
  const s = String(v ?? '').trim().toLowerCase();
  return s.length >= 2 ? s : null;
};

/**
 * EVERY identifier a row carries. Two rows that share ANY of these keys are the
 * same person, so a WhatsApp thread (phone) and a Facebook thread (social id)
 * that both hang off the same CRM card collapse into one conversation.
 */
export function threadIdentityKeys(v: ThreadLike): string[] {
  const keys: string[] = [];

  const phone = normalizePhoneKey(v.phone_number ?? v.metadata?.sender_phone);
  if (phone) keys.push(`p:${phone}`);

  const email = clean(v.email);
  if (email && email.includes('@')) keys.push(`e:${email}`);

  const socials = [
    v.social_profile_id,
    v.facebook_id,
    v.messenger_id,
    v.messenger_psid,
    v.instagram_id,
    v.instagram_psid,
    v.instagram_handle,
    v.telegram_username,
    v.metadata?.sender_id,
    v.metadata?.psid,
    v.metadata?.social_profile_id,
  ];
  for (const s of socials) {
    const key = clean(s);
    if (key) keys.push(`s:${key}`);
  }

  // Name is only a fallback identity: it must never merge two rows that already
  // carry a stronger identifier of their own.
  if (!keys.length) {
    const name = normalizeNameKey(v.full_name);
    if (name) keys.push(`n:${name}`);
  }

  if (!keys.length) keys.push(`id:${v.id}`);
  return Array.from(new Set(keys));
}

/** Stable identity key used to merge multiple threads of the same person. */
export function threadIdentityKey(v: ThreadLike): string {
  return threadIdentityKeys(v)[0];
}

/**
 * Groups rows of the same person together by unioning shared identifiers
 * (transitive: phone-row + phone/email row + email/social row = one group).
 */
export function groupByIdentity<T extends ThreadLike>(rows: T[]): T[][] {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let cur = k;
    while (parent.get(cur) && parent.get(cur) !== cur) cur = parent.get(cur)!;
    parent.set(k, cur);
    return cur;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  const rowKeys = rows.map((r) => {
    const keys = threadIdentityKeys(r);
    keys.forEach((k) => { if (!parent.has(k)) parent.set(k, k); });
    keys.slice(1).forEach((k) => union(keys[0], k));
    return keys;
  });

  const buckets = new Map<string, T[]>();
  rows.forEach((row, i) => {
    const root = find(rowKeys[i][0]);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root)!.push(row);
  });
  return Array.from(buckets.values());
}

