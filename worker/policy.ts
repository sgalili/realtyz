export function retryDelay(attempt: number, retryAfterMs = 0) {
  return Math.min(180000, Math.max(Math.min(120000, 15000 * 2 ** Math.max(0, attempt - 1)), retryAfterMs));
}
export function configuration(env: NodeJS.ProcessEnv) {
  const required = ['TORAFF_IMPORT_API_URL', 'IMPORT_WORKER_SHARED_SECRET', 'BRIGHT_DATA_API_KEY', 'BRIGHTDATA_UNLOCKER_ZONE'];
  for (const key of required) if (!env[key]) throw new Error(`Missing ${key}`);
  const url = new URL(env.TORAFF_IMPORT_API_URL ?? '');
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Import API must use HTTPS');
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} must be ${min}..${max}`);
    return value;
  };
  return { api: url.href, secret: env.IMPORT_WORKER_SHARED_SECRET ?? '', token: env.BRIGHT_DATA_API_KEY ?? '', zone: env.BRIGHTDATA_UNLOCKER_ZONE ?? '', id: env.IMPORT_WORKER_ID ?? 'railway-toraff-1',
    concurrency: integer('WORKER_CONCURRENCY', 4, 1, 5),
    interval: integer('WORKER_REQUEST_INTERVAL_MS', 1000, 250, 15000),
    timeout: integer('WORKER_SOURCE_TIMEOUT_MS', 45000, 10000, 120000),
    poll: integer('WORKER_POLL_INTERVAL_MS', 5000, 1000, 60000),
  };
}