/** Social redistribution never carries the promoting account's identity. */
export function anonymousSocialText(input: unknown, identities: string[] = []): string {
  let text = String(input ?? '');
  for (const identity of identities) {
    const value = identity.trim();
    if (!value || value.length < 2) continue;
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(escaped, 'giu'), '');
  }
  return text
    .replace(/(?:\+?972[\s().-]*|0)\d(?:[\s().-]*\d){7,9}/g, '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '')
    .replace(/^.*(?:רישיון תיווך|טלפון\s*:|נייד\s*:|שם המפרסם\s*:|שם השותף\s*:).*$/gm, '')
    .replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Remove identities that exist in server-owned records, never arbitrary client claims. */
export async function socialPrivacyIdentities(db: any, workspace: string, listingId?: string | null): Promise<string[]> {
  const { data: members } = await db.from('workspace_memberships').select('user_id').eq('workspace_owner_id', workspace);
  const ids = [...new Set([workspace, ...(members ?? []).map((row: any) => row.user_id)].filter(Boolean))];
  const { data: profiles } = await db.from('profiles').select('full_name,phone,broker_byline').in('id', ids);
  const identities = (profiles ?? []).flatMap((row: any) => [row.full_name, row.phone, row.broker_byline]).filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 1);
  if (listingId && /^[0-9a-f-]{36}$/i.test(listingId)) {
    const { data: listing } = await db.from('listings').select('source_metadata').eq('id', listingId).maybeSingle();
    const metadata = listing?.source_metadata ?? {};
    for (const [key, value] of Object.entries(metadata)) {
      if (/(?:name|phone|byline)/i.test(key) && typeof value === 'string') identities.push(value);
    }
  }
  return identities;
}