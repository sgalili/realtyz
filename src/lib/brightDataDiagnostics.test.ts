import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRIGHT_DATA_TIMEOUT_MS, BROKER_WORKER_CALL_TIMEOUT_MS, readWorkerResponse, logProviderFailure, logUnlockerRequest, logUnlockerResponse } from '../../supabase/functions/_shared/brightDataDiagnostics';

beforeEach(() => {
  // jsdom's older AbortSignal lacks timeout; match the deployed runtime's API.
  Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('Signal timed out', 'TimeoutError')), ms);
    return controller.signal;
  } });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('Bright Data request diagnostics', () => {
  it('logs the exact request payload without an authorization credential', () => {
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {});
    logUnlockerRequest('web_unlocker4', 'https://www.yad2.co.il/realestate/item/abc');
    expect(JSON.parse(logged.mock.calls[0][1])).toEqual({ endpoint: 'https://api.brightdata.com/request', method: 'POST', payload: { zone: 'web_unlocker4', url: 'https://www.yad2.co.il/realestate/item/abc', format: 'raw' } });
  });
  it('logs response status and bounded HTML while redacting contact details and credentials', () => {
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {});
    logUnlockerResponse('https://www.yad2.co.il', 200, '<html>user@example.com 0521234567 Bearer private-key ' + 'x'.repeat(9000), 15);
    const entry = JSON.parse(logged.mock.calls[0][1]);
    expect(entry.http_status).toBe(200);
    expect(entry.response_payload).toHaveLength(8192);
    expect(entry.payload_truncated).toBe(true);
    expect(entry.response_payload).not.toMatch(/user@example.com|0521234567|private-key/);
  });
  it('keeps the local daily import limit distinct from a provider 429 and retains its deadline', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = vi.fn(async () => new Response(JSON.stringify({error: 'daily_import_limit', detail: 'Daily import blocked', retry_at: '2026-11-12T04:41:30Z'}), {status:429}));
    await expect(readWorkerResponse('https://worker.test/import', {}, transport as typeof fetch)).rejects.toMatchObject({name: 'ImportAvailabilityError', code: 'daily_import_limit', retryAt: '2026-11-12T04:41:30Z', message: 'Daily import blocked'});
  });
  it('allows 120 seconds for provider requests', () => {
    expect(BRIGHT_DATA_TIMEOUT_MS).toBe(120_000);
  });
  it('does not abort a delayed worker at the old 45 second timeout', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
      signal = init?.signal;
      await new Promise(resolve => setTimeout(resolve, 119_000));
      return new Response(JSON.stringify({ results: [{ source_url: 'existing' }] }));
    });
    const pending = readWorkerResponse('https://worker.test/import', {}, transport as typeof fetch);
    await vi.advanceTimersByTimeAsync(119_000);
    expect(signal?.aborted).toBe(false);
    expect(BROKER_WORKER_CALL_TIMEOUT_MS).toBeGreaterThan(BRIGHT_DATA_TIMEOUT_MS);
    expect(await pending).toEqual({ results: [{ source_url: 'existing' }] });
  });
  it.each([401, 429, 504])('records the exact HTTP %s and payload on failure', async status => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = vi.fn(async () => new Response(JSON.stringify({ error: 'provider failure', access_token: 'private-value' }), { status }));
    await expect(readWorkerResponse('https://worker.test/import', {}, transport as typeof fetch)).rejects.toThrow(String(status));
    const entry = JSON.parse(logged.mock.calls[0][1]);
    expect(entry.http_status).toBe(status);
    expect(entry.response_payload).toContain('provider failure');
    expect(entry.response_payload).not.toContain('private-value');
  });
  it('logs timeouts with no invented HTTP status', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = vi.fn(async () => { throw new DOMException('Signal timed out', 'TimeoutError'); });
    await expect(readWorkerResponse('https://worker.test/import', {}, transport as typeof fetch)).rejects.toThrow('זמן ההמתנה');
    expect(JSON.parse(logged.mock.calls[0][1])).toMatchObject({ http_status: null, error: 'TimeoutError: Signal timed out' });
  });
  it('preserves a soft 429 and its retry deadline for checkpoint backoff',async()=>{
    vi.spyOn(console,'error').mockImplementation(()=>{});
    const transport=vi.fn(async()=>new Response(JSON.stringify({error:'brightdata_rate_limited',retry_after_ms:90000})));
    await expect(readWorkerResponse('https://worker.test/import',{},transport as typeof fetch)).rejects.toMatchObject({name:'ProviderRateLimitError',retryAfterMs:90000});
  });
  it('honors Retry-After even when the 429 body is not JSON',async()=>{
    vi.spyOn(console,'error').mockImplementation(()=>{});
    const transport=vi.fn(async()=>new Response('Too many requests',{status:429,headers:{'Retry-After':'90'}}));
    await expect(readWorkerResponse('https://worker.test/import',{},transport as typeof fetch)).rejects.toMatchObject({name:'ProviderRateLimitError',retryAfterMs:90000});
  });
  it('bounds payloads and removes authorization/browser credentials', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    logProviderFailure({ operation: 'rest', url: 'https://provider.test/?token=private-value', error: 'Bearer secret-value wss://user:pass@browser.test', payload: 'x'.repeat(9000), elapsedMs: 120000 });
    const entry = JSON.parse(logged.mock.calls[0][1]);
    expect(entry.response_payload).toHaveLength(8192);
    expect(entry.payload_truncated).toBe(true);
    expect(logged.mock.calls[0][1]).not.toMatch(/private-value|secret-value|user:pass/);
  });
});