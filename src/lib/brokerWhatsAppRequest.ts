import { supabase } from '@/integrations/supabase/client';
import { brokerUserError, transientBrokerConnectionError } from '../../supabase/functions/_shared/brokerRecovery';

/** Retry reads only; never replay saving, queue creation, sending or other mutations. */
export async function brokerWhatsAppRequest<T = any>(fn: string, body: Record<string, unknown>): Promise<T> {
  const readOnly = ['status', 'batch_status', 'bulk_targets'].includes(String(body.action)) ||
    (fn === 'admin-broker-invitation' && ['whatsapp_eligibility','texts'].includes(String(body.action))) ||
    (fn === 'admin-broker-contact' && ['list','history','imports'].includes(String(body.action)));
  const backoff = [250, 750];
  for (let attempt = 0; ; attempt++) {
    let reason: unknown;
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (!error && !data?.error) return data as T;
      const context = (error as { context?: Response } | null)?.context;
      const detail = data?.error ? data : await context?.clone().json().catch(() => null);
      reason = { message: detail?.error ?? error?.message, status: detail?.retryable === false ? undefined : context?.status };
    } catch (error) { reason = error; }
    if (!readOnly || !transientBrokerConnectionError(reason) || attempt >= backoff.length) {
      const safe = brokerUserError(reason);
      // A lost send response is uncertain, not permission to resend; preserve explicit server receipt warnings.
      const message = body.action === 'send' && transientBrokerConnectionError(reason) && safe !== (reason as {message?:string})?.message
        ? 'לא ניתן לאשר אם ההזמנה נשלחה. בדקו את היסטוריית השליחה לפני ניסיון נוסף.' : safe;
      throw new Error(message);
    }
    await new Promise(resolve => setTimeout(resolve, backoff[attempt]));
  }
}