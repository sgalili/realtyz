import { isMakeWebhookUrl } from './growPayment.ts';
export async function callGrowMake(environment: string, payload: unknown) {
  const prefix = environment === 'live' ? 'GROW_MAKE_LIVE' : 'GROW_MAKE_SANDBOX';
  const url = Deno.env.get(`${prefix}_URL`) ?? '';
  const key = Deno.env.get(`${prefix}_API_KEY`) ?? '';
  if (!url || !key || !isMakeWebhookUrl(url)) throw new Error('make_not_configured');
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-make-apikey': key }, body: JSON.stringify(payload), signal: AbortSignal.timeout(40000), redirect: 'error' });
  if (!response.ok) { console.error('[grow-make] response status', response.status); throw new Error(`make_http_${response.status}`); }
  try { return await response.json(); } catch { throw new Error('make_response_must_be_json'); }
}