type RpcError = { message?: string; details?: string; code?: string; status?: number; cause?: unknown };

export function transientBrokerConnectionError(reason: unknown): boolean {
  const seen = new Set<unknown>();
  for (let current = reason; current && !seen.has(current); ) {
    seen.add(current);
    const error = current as RpcError;
    const status = error?.status;
    if (status === 408 || status === 429 || (typeof status === 'number' && status >= 500 && status <= 504)) return true;
    if (['08000','08003','08006','57P01','53300'].includes(error?.code ?? '')) return true;
    const message = typeof current === 'string' ? current : `${error?.message ?? ''} ${error?.details ?? ''} ${error?.code ?? ''}`;
    if (/connection[ _-]?(reset|error|closed)|ECONNRESET|ETIMEDOUT|EPIPE|SendRequest|error sending request|failed to send.*request|failed to fetch|fetch failed|network(error| request| error)|socket hang up|timed? ?out|temporarily unavailable/i.test(message)) return true;
    current = error?.cause;
  }
  return false;
}

/** Keep the original reason for classification, without exposing it in the public message. */
export function brokerFailure(message: string, cause: unknown) {
  return Object.assign(new Error(message), { cause });
}

/** Use only for reads or server-idempotent auxiliary work, never external sends or claims. */
export async function withBrokerConnectionRetry<T>(operation: () => Promise<T>, wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))): Promise<T> {
  const backoff = [250,750];
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (!transientBrokerConnectionError(error) || attempt >= backoff.length) throw error;
      await wait(backoff[attempt]);
    }
  }
}

/** Never return transport, database or provider internals to a browser. */
export function brokerUserError(reason: unknown, fallback = 'הפעולה לא הושלמה. נסו שוב בעוד רגע.'): string {
  const error = reason as RpcError | null;
  const message = typeof reason === 'string' ? reason : error?.message ?? '';
  const known: Record<string, string> = { forbidden: 'אין הרשאה לביצוע הפעולה', forbidden_action: 'אין הרשאה לביצוע הפעולה', forbidden_batch: 'אין הרשאה לפעולת האיתור', stale_worker_lease: 'המשימה כבר הועברה לטיפול אחר', no_source: 'אין מודעת יד2 שמורה ומזוהה עם המתווך', scanner_operation_failed: 'הבדיקה מול Green API נכשלה. נסו שוב בעוד דקה.' };
  if (known[message]) return known[message];
  if (/[א-ת]/.test(message) && !/https?:|TypeError|Error:|\b(?:socket|port|stack|rpc|rest\/v1)\b|\b\d{1,3}(?:\.\d{1,3}){3}\b|\n|^\s*[\[{]|"(?:error|stack)"\s*:/i.test(message)) return message.slice(0, 220);
  if (transientBrokerConnectionError(reason)) return 'החיבור לשירות נקטע זמנית. נסו שוב בעוד רגע.';
  return fallback;
}

/** Recovery is idempotent and auxiliary: its failure must not cancel the actual operation. */
export async function recoverBrokerWhatsAppJobs(
  db: { rpc: (name: string) => PromiseLike<{ error: unknown }> },
  wait: (milliseconds: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
) {
  const backoff = [250, 750];
  for (let attempt = 0; ; attempt++) {
    let reason: unknown;
    try {
      const result = await db.rpc('recover_broker_whatsapp_jobs');
      if (!result.error) return { recovered: true, attempts: attempt + 1, transient: false };
      reason = result.error;
    } catch (error) { reason = error; }
    const transient = transientBrokerConnectionError(reason);
    if (!transient || attempt >= backoff.length) return { recovered: false, attempts: attempt + 1, transient };
    await wait(backoff[attempt]);
  }
}