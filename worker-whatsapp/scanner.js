const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Separate scanner lane: dedicated secret, never the discovery or official messaging credential. */
export function scannerConfiguration(env) {
  if (env.BROKER_WA_SCANNER_ENABLED !== 'true') return null;
  for (const key of ['TORAFF_BROKER_WA_SCANNER_API_URL', 'BROKER_WA_SCANNER_WORKER_SECRET']) if (!env[key]) throw new Error(`Missing ${key}`);
  const url = new URL(env.TORAFF_BROKER_WA_SCANNER_API_URL);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Scanner API must use HTTPS');
  if (env.BROKER_WA_SCANNER_WORKER_SECRET === env.BROKER_WA_WORKER_SHARED_SECRET) throw new Error('Scanner secret must differ from discovery secret');
  return { api: url.href, secret: env.BROKER_WA_SCANNER_WORKER_SECRET, tick: 30000 };
}

export function createScannerApi(config, fetcher = fetch) {
  return async body => {
    const response = await fetcher(config.api, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-broker-wa-scanner-secret': config.secret }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(result.error ?? `scanner_http_${response.status}`), { status: response.status });
    return result;
  };
}

export async function runScanner(config, { source, isStopping }, api = createScannerApi(config)) {
  try { const u = new URL(config.api); console.log(JSON.stringify({ event: 'broker_wa_scanner_lane_started', api_host: u.host, path: u.pathname })); } catch { /* test doubles */ }
  while (!isStopping()) {
    try {
      const { job } = await api({ action: 'claim_source' });
      if (job) {
        try { await api({ action: 'source_result', job_id: job.id, lease_token: job.lease_token, html: await source(job.source_url) }); }
        catch (error) { await api({ action: 'source_failure', job_id: job.id, lease_token: job.lease_token, status: error.status >= 400 && error.status <= 599 ? error.status : 504 }); }
      }
      // Cloud owns quota, jitter (24/7) and circuit state; this only wakes it.
      await api({ action: 'tick' });
    } catch (error) {
      const denied = [401, 403].includes(error.status);
      // Never stop silently: a rejected secret is logged and retried slowly until Railway's value matches Cloud.
      console.error(JSON.stringify({ event: denied ? 'broker_wa_scanner_auth_rejected' : 'broker_wa_scanner_error', status: error.status ?? null, hint: denied ? 'BROKER_WA_SCANNER_WORKER_SECRET differs from Cloud' : undefined }));
      if (denied) { await delay(300000); continue; }
    }
    await delay(config.tick);
  }
}