import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { configuration, retryAfterSeconds, sourceAllowed } from './policy.js';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export function createCloudApi(config, fetcher = fetch) {
  return async body => {
    const response = await fetcher(config.api, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-broker-wa-worker-secret': config.secret }, body: JSON.stringify({ ...body, worker_id: config.id }), signal: AbortSignal.timeout(60000) });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error ?? `cloud_http_${response.status}`), { status: response.status });
    return result;
  };
}

export async function processJob(job, { api, source }) {
  const scope = { job_id: job.id, lease_token: job.lease_token };
  if (job.status !== 'running') throw new Error('invalid_discovery_state');
  let html;
  try {
    if (!sourceAllowed(job.source_url)) throw Object.assign(new Error('invalid_source_url'), { status: 400 });
    html = await source(job.source_url);
  } catch (error) {
    await api({ action: 'failure', ...scope, status: error.status ?? 504, error: String(error.message).slice(0, 2000), retry_after: error.retryAfter ?? 0 });
    return;
  }
  // A failed commit is not a source error: leave its lease to expire instead of overwriting a successful save.
  await api({ action: 'result', ...scope, html });
}

export async function startBrokerWhatsAppWorker() {
  if (process.env.BROKER_WA_WORKER_ENABLED !== 'true') return;
  const config = configuration(process.env);
  let stopping = false, suspended = false, nextRequest = 0;
  let gate = Promise.resolve();
  const stop = () => { stopping = true; };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  const api = createCloudApi(config);
  const pace = () => {
    const turn = gate.then(async () => { await delay(Math.max(0, nextRequest - Date.now())); nextRequest = Date.now() + config.interval; });
    gate = turn.catch(() => {});
    return turn;
  };
  const source = async url => {
    await pace();
    if (stopping || suspended) throw Object.assign(new Error('worker_stopping'), { status: 503 });
    const response = await fetch('https://api.brightdata.com/request', { method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ zone: config.zone, url, format: 'raw' }), signal: AbortSignal.timeout(config.timeout) });
    const reader = response.body?.getReader();
    if (!reader) throw Object.assign(new Error('empty_source'), { status: 502 });
    const chunks = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4000000) { await reader.cancel(); throw Object.assign(new Error('source_too_large'), { status: 413 }); }
      chunks.push(value);
    }
    const html = Buffer.concat(chunks).toString('utf8');
    const providerError = `${response.headers.get('x-brd-err-code') ?? ''} ${response.headers.get('x-brd-error') ?? ''}`;
    const retryAfter = retryAfterSeconds(response.headers.get('retry-after'));
    if (response.status === 429) nextRequest = Math.max(nextRequest, Date.now() + Math.max(15000, retryAfter * 1000));
    console.log(JSON.stringify({ event: 'broker_wa_source', status: response.status, bytes: size, zone: config.zone }));
    if (/client_10020|account.*suspend/i.test(providerError + html.slice(0,500)) || response.status === 407) suspended = true;
    if (!response.ok || providerError.trim()) throw Object.assign(new Error(`source_http_${response.status}; ${providerError.replaceAll(config.token,'[redacted]').slice(0,300)}`), { status: suspended ? 407 : response.ok ? 502 : response.status, retryAfter });
    return html;
  };
  const lane = async () => {
    while (!stopping && !suspended) {
      try {
        const { job } = await api({ action: 'claim' });
        if (job) await processJob(job, { api, source }); else await delay(config.poll);
      } catch (error) {
        console.error(JSON.stringify({ event: 'broker_wa_error', status: error.status ?? null, error: String(error.message).replaceAll(config.secret,'[redacted]').replaceAll(config.token,'[redacted]').slice(0,500) }));
        if ([401,403].includes(error.status)) { stopping = true; break; }
        await delay(config.poll);
      }
    }
  };
  try { await Promise.all(Array.from({ length: config.concurrency }, lane)); }
  finally { process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startBrokerWhatsAppWorker().catch(() => { console.error('Broker WhatsApp worker configuration failed'); process.exitCode = 1; });