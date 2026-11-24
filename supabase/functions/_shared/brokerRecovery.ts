type RpcError = { message?: string; details?: string; code?: string; status?: number };

export function transientBrokerConnectionError(reason: unknown): boolean {
  const error = reason as RpcError | null;
  const status = error?.status;
  if (status === 408 || status === 429 || (typeof status === 'number' && status >= 500 && status <= 504)) return true;
  const message = typeof reason === 'string' ? reason : `${error?.message ?? ''} ${error?.details ?? ''} ${error?.code ?? ''}`;
  return /connection[ _-]?(reset|error|closed)|ECONNRESET|ETIMEDOUT|EPIPE|SendRequest|error sending request|failed to send.*request|failed to fetch|fetch failed|network(error| request| error)|socket hang up|timed? ?out|temporarily unavailable/i.test(message);
}

/** Never return transport, database or provider internals to a browser. */
export function brokerUserError(reason: unknown, fallback = 'הפעולה לא הושלמה. נסו שוב בעוד רגע.'): string {
  if (transientBrokerConnectionError(reason)) return 'החיבור לשירות נקטע זמנית. נסו שוב בעוד רגע.';
  const error = reason as RpcError | null;
  const message = typeof reason === 'string' ? reason : error?.message ?? '';
  const known: Record<string, string> = { forbidden: 'אין הרשאה לביצוע הפעולה', forbidden_action: 'אין הרשאה לביצוע הפעולה', forbidden_batch: 'אין הרשאה לפעולת האיתור', stale_worker_lease: 'המשימה כבר הועברה לטיפול אחר', no_source: 'אין מודעת יד2 שמורה ומזוהה עם המתווך', scanner_operation_failed: 'הבדיקה מול Green API נכשלה. נסו שוב בעוד דקה.' };
  if (known[message]) return known[message];
  if (/[א-ת]/.test(message) && !/https?:|TypeError|Error:|\b(?:socket|port|stack|rpc|rest\/v1)\b|\b\d{1,3}(?:\.\d{1,3}){3}\b|\n/i.test(message)) return message.slice(0, 220);
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