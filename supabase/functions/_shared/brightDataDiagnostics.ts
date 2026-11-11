// Leave parsing/response time between a provider request and its enclosing worker call.
import { ProviderRateLimitError, retryAfterMs } from './brightDataThrottle.ts';
import { rotatingUnlockerPayload } from './brightDataRotation.ts';
export const BRIGHT_DATA_TIMEOUT_MS = 120_000;
export const BRIGHT_DATA_WORKER_BUDGET_MS = 130_000;
export const BROKER_WORKER_CALL_TIMEOUT_MS = 140_000;

export function redactDiagnostic(value: string): string {
  return value
    .replace(/Bearer\s+[^\s"<>]+/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:token|key|password|access_token)=)[^&\s"<>]+/gi, '$1[REDACTED]')
    .replace(/("(?:[^"\s]*(?:token|password|secret|api_key|authorization)[^"\s]*)"\s*:\s*")[^"]*/gi, '$1[REDACTED]')
    .replace(/wss?:\/\/[^\s"<>]+/gi, '[REDACTED_BROWSER_ENDPOINT]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/(?:\+?972[\s-]?5|05)\d(?:[\s-]?\d){7}/g, '[REDACTED_PHONE]');
}

export function logUnlockerRequest(zone: string, url: string) {
  console.log('[bright-data-request]', JSON.stringify({
    endpoint: 'https://api.brightdata.com/request', method: 'POST',
    payload: rotatingUnlockerPayload(zone, redactDiagnostic(url)),
  }));
}

export function logUnlockerResponse(url: string, status: number, body: string, elapsedMs: number) {
  // Raw HTML may contain personal contact details; log a bounded sanitized preview.
  const safeBody = redactDiagnostic(body);
  console.log('[bright-data-response]', JSON.stringify({
    url: redactDiagnostic(url), http_status: status, elapsed_ms: elapsedMs,
    bytes: new TextEncoder().encode(body).length,
    response_payload: safeBody.slice(0, 8192), payload_truncated: safeBody.length > 8192,
  }));
}

export class ImportAvailabilityError extends Error {
  constructor(message: string, public code: string, public retryAt: string | null) {
    super(message); this.name = 'ImportAvailabilityError';
  }
}

/** Slow or gateway-lagged provider reads; discovery skips the page instead of halting. */
export class ProviderTimeoutError extends Error {
  constructor(message: string, public status?: number) { super(message); this.name = 'ProviderTimeoutError'; }
}

export function logProviderFailure(context: { operation: string; url: string; status?: number; upstreamStatus?: string; payload?: string; error?: unknown; elapsedMs: number }) {
  const message = describeError(context.error);
  const payload = redactDiagnostic(context.payload ?? '');
  console.error('[bright-data-request-failed]', JSON.stringify({
    operation: context.operation, url: redactDiagnostic(context.url),
    http_status: context.status ?? null, upstream_status: context.upstreamStatus ?? null,
    error: redactDiagnostic(message), elapsed_ms: context.elapsedMs,
    response_payload: payload.slice(0, 8192), payload_truncated: payload.length > 8192,
  }));
}

function describeError(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error && 'message' in error) return `${String(error.name)}: ${String(error.message)}`;
  return String(error ?? 'Upstream request failed');
}

export function providerErrorMessage(status: number | undefined, timedOut = false): string {
  if (timedOut) return 'הבקשה ל־Bright Data חרגה מזמן ההמתנה. ההתקדמות נשמרה; ניתן ללחוץ על המשך כדי לנסות שוב.';
  if (status === 401 || status === 403) return `Bright Data: שגיאת הרשאה (${status}). יש לבדוק את הגדרות החיבור לפני המשך.`;
  if (status === 429) return 'Bright Data: מגבלת בקשות (429). המתן מעט ולחץ על המשך; ההתקדמות נשמרה.';
  if (status === 504) return 'Bright Data: פסק זמן בשער השירות (504). ניתן ללחוץ על המשך מאותה נקודה.';
  return `הבקשה ל־Bright Data נכשלה${status ? ` (HTTP ${status})` : ''}. ההתקדמות נשמרה; ניתן לנסות שוב באמצעות המשך.`;
}

// Injected transport makes delayed/error responses testable without paid provider calls.
export async function readWorkerResponse(url: string, init: RequestInit, transport: typeof fetch = fetch) {
  const started = Date.now();
  let status: number | undefined;
  let payload = '';
  try {
    const response = await transport(url, { ...init, signal: AbortSignal.timeout(BROKER_WORKER_CALL_TIMEOUT_MS) });
    status = response.status;
    payload = await response.text();
    let data: any;
    try { data = JSON.parse(payload); } catch {
      if (status === 429) throw new ProviderRateLimitError(retryAfterMs(response.headers.get('retry-after')));
      throw new Error(`Invalid worker JSON (HTTP ${status})`);
    }
    if (data?.error === 'daily_import_limit' || data?.error === 'import_in_progress' || data?.error === 'non_residential_listing') {
      throw new ImportAvailabilityError(String(data.detail ?? data.error), data.error, typeof data.retry_at === 'string' ? data.retry_at : null);
    }
    if (status === 429 || data?.error === 'brightdata_rate_limited' || data?.bd_trace?.some((entry: { bd_status?: number }) => entry.bd_status === 429)) {
      throw new ProviderRateLimitError(Math.max(retryAfterMs(response.headers.get('retry-after')), Number(data?.retry_after_ms) || 0));
    }
    if (!response.ok || data?.error || data?.ok === false || data?.success === false) {
      throw new Error(String(data?.detail ?? data?.error ?? `HTTP ${status}`));
    }
    if (!data || typeof data !== 'object') throw new Error('Invalid worker response');
    return data;
  } catch (error) {
    logProviderFailure({ operation: 'broker_worker', url, status, payload, error, elapsedMs: Date.now() - started });
    if (error instanceof ProviderRateLimitError) throw error;
    if (error instanceof ImportAvailabilityError) throw error;
    const timedOut = /timeout|abort|timed out/i.test(describeError(error));
    if (timedOut || status === 502 || status === 503 || status === 504) throw new ProviderTimeoutError(providerErrorMessage(status, timedOut), status);
    throw new Error(providerErrorMessage(status, timedOut));
  }
}