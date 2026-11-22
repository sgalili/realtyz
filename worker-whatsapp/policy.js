export function configuration(env) {
  for (const key of ['TORAFF_BROKER_WA_API_URL', 'BROKER_WA_WORKER_SHARED_SECRET', 'BRIGHT_DATA_API_KEY', 'BRIGHTDATA_UNLOCKER_ZONE']) {
    if (!env[key]) throw new Error(`Missing ${key}`);
  }
  const url = new URL(env.TORAFF_BROKER_WA_API_URL);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Worker API must use HTTPS');
  const integer = (key, value, min, max) => {
    const number = Number(env[key] ?? value);
    if (!Number.isInteger(number) || number < min || number > max) throw new Error(`Invalid ${key}`);
    return number;
  };
  return { api: url.href, secret: env.BROKER_WA_WORKER_SHARED_SECRET, token: env.BRIGHT_DATA_API_KEY, zone: env.BRIGHTDATA_UNLOCKER_ZONE,
    id: env.BROKER_WA_WORKER_ID ?? 'railway-broker-wa-1', concurrency: integer('BROKER_WA_CONCURRENCY', 1, 1, 3),
    interval: integer('BROKER_WA_REQUEST_INTERVAL_MS', 5000, 1000, 60000), poll: integer('BROKER_WA_POLL_INTERVAL_MS', 10000, 1000, 60000),
    timeout: integer('BROKER_WA_SOURCE_TIMEOUT_MS', 45000, 10000, 60000) };
}
export function sourceAllowed(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.yad2.co.il' && !url.username && !url.password && /^\/realestate\/item\/[a-zA-Z0-9]+$/.test(url.pathname);
  } catch { return false; }
}
export function retryAfterSeconds(value, now = Date.now()) {
  const seconds = /^\d+$/.test(value ?? '') ? Number(value) : (Date.parse(value ?? '') - now) / 1000;
  return Number.isFinite(seconds) ? Math.max(0, Math.min(180, Math.ceil(seconds))) : 0;
}