import { supabase } from '@/integrations/supabase/client';

interface LogErrorParams {
  source: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  severity?: 'error' | 'warning' | 'timeout';
}

/**
 * Persist a client-side error to the `error_logs` table for admin visibility.
 * Failures here are swallowed — logging must never break the app.
 */
export async function logClientError({
  source,
  message,
  stack,
  context = {},
  severity = 'error',
}: LogErrorParams): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('error_logs').insert({
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
      source,
      message: String(message).slice(0, 1000),
      stack: stack?.slice(0, 4000) ?? null,
      context: context as never,
      url: typeof window !== 'undefined' ? window.location.pathname : null,
      severity,
    });
  } catch {
    // Silent fail — never disturb the user with logging errors.
  }
}
