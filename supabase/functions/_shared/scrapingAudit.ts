import { createClient } from 'npm:@supabase/supabase-js@2';

const client = () => createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });

export async function targetHash(url: string) {
  const parsed = new URL(url);
  parsed.hash = '';
  parsed.searchParams.sort();
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parsed.href));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
}

/** No URLs, query text, credentials or scraped personal data enter the audit. */
export async function trackScraping<T>(feature: string, operation: string, url: string, work: () => Promise<T>, metrics: (value: T) => { status?: number; bytes?: number } = () => ({})) {
  const admin = client();
  const started = Date.now();
  const { data, error } = await admin.from('scraping_usage_events').insert({ feature, operation, target_hash: await targetHash(url) }).select('id').single();
  if (error || !data) throw new Error('scraping_audit_unavailable');
  try {
    const value = await work();
    const m = metrics(value);
    const failed = m.status != null && m.status >= 400;
    const { error: saveError } = await admin.from('scraping_usage_events').update({ outcome: failed ? 'error' : 'success', http_status: m.status ?? null, response_bytes: m.bytes ?? 0, duration_ms: Date.now() - started }).eq('id', data.id);
    if (saveError) console.error('[scraping-audit] completion not recorded');
    return value;
  } catch (e) {
    await admin.from('scraping_usage_events').update({ outcome: 'error', duration_ms: Date.now() - started }).eq('id', data.id);
    throw e;
  }
}

export async function recordCacheHit(feature: string, operation: string, url: string) {
  const { error } = await client().from('scraping_usage_events').insert({ feature, operation, target_hash: await targetHash(url), outcome: 'cache_hit' });
  if (error) console.error('[scraping-audit] cache hit not recorded');
}

/** Shared atomic lease; successful reads never extend fetched_at. */
export async function cachedScrapingText(feature: string, url: string, ttl: number, work: () => Promise<string>) {
  const admin = client();
  const key = `${feature}:${await targetHash(url)}`;
  const { data: claim, error } = await admin.rpc('claim_scraping_response', { _key: key, _ttl_seconds: ttl });
  if (error) throw new Error('scraping_cache_unavailable');
  if (claim.state === 'cached') {
    await recordCacheHit(feature, 'page', url);
    return String(claim.payload);
  }
  if (claim.state === 'busy') {
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const { data } = await admin.from('scraping_response_cache').select('payload,fetched_at').eq('cache_key', key).maybeSingle();
      if (data?.payload != null && Date.parse(data.fetched_at ?? '') > Date.now() - ttl * 1000) {
        await recordCacheHit(feature, 'page', url);
        return data.payload;
      }
    }
    throw new Error('scraping_in_progress');
  }
  try {
    const payload = await work();
    const { error: saved } = await admin.from('scraping_response_cache').update({ payload, fetched_at: new Date().toISOString(), lease_token: null, lease_until: null }).eq('cache_key', key).eq('lease_token', claim.token);
    if (saved) throw new Error('scraping_cache_save_failed');
    return payload;
  } catch (e) {
    await admin.from('scraping_response_cache').update({ lease_token: null, lease_until: null }).eq('cache_key', key).eq('lease_token', claim.token);
    throw e;
  }
}