// Shared helper used by edge functions to log a failed integration call.
// Fire-and-forget — never throws, never blocks the caller.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type IntegrationName =
  | "whatsapp"
  | "homely"
  | "transcription"
  | "ai_gateway"
  | "email_queue";

export async function logIntegrationError(params: {
  integration: IntegrationName;
  functionName?: string;
  errorCode?: string | number | null;
  errorMessage?: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    const sb = createClient(url, key, { auth: { persistSession: false } });
    await sb.from("integration_error_logs").insert({
      integration: params.integration,
      function_name: params.functionName ?? null,
      error_code: params.errorCode != null ? String(params.errorCode) : null,
      error_message: (params.errorMessage ?? "").slice(0, 2000),
      context: params.context ?? {},
    });
  } catch {
    // Swallow — observability must never break business logic.
  }
}
