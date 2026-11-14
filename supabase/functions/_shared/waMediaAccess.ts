export interface MediaCredential {
  accessToken: string;
  apiVersion: string;
  phoneNumberId?: string;
}

export interface MediaProvider {
  user_id?: string | null;
  tenant_id?: string | null;
  config: Record<string, unknown>;
}

export function missingMediaCredentials() {
  return { available: false, error: 'media_credentials_missing', reason: 'authorization_required', stage: 'credentials' };
}

/** Media belongs to the receiving phone, not whichever token was saved last. */
export function mediaCredentials(rows: MediaProvider[], phoneId: string, ownerId: string, central: MediaCredential | null): MediaCredential[] {
  const candidates: MediaCredential[] = rows.filter(row => {
    if (!row.config.access_token || row.config.authorized === false) return false;
    return phoneId ? String(row.config.phone_number_id ?? '') === phoneId
      : !!ownerId && (row.user_id === ownerId || row.tenant_id === ownerId);
  }).map(row => ({ accessToken: String(row.config.access_token), apiVersion: String(row.config.api_version || 'v26.0'), phoneNumberId: String(row.config.phone_number_id || '') }));
  if (central && (!phoneId || central.phoneNumberId === phoneId)) candidates.push(central);
  return candidates.filter((item, index) => candidates.findIndex(other => other.accessToken === item.accessToken) === index);
}

export function mediaLookupFailure(status: number, error: { code?: number; error_subcode?: number } | undefined) {
  const unavailable = status === 404 || (error?.code === 100 && error?.error_subcode === 33);
  return { unavailable, reason: unavailable ? 'expired_or_inaccessible' : status === 401 || status === 403 || error?.code === 190 || error?.code === 10 || error?.code === 200 ? 'permissions' : 'provider_error' };
}

export function safeMetaMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      ['facebook.com', 'fbcdn.net', 'fbsbx.com'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}