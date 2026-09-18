// Safe tool-failure handling for every AI surface.
// Raw errors (SQL/schema/timeouts/HTTP) are logged internally and NEVER
// surfaced to the user. The user always gets a natural Hebrew clarifying
// question that keeps the conversation moving instead of an error notice.
import { logIntegrationError } from "./logIntegrationError.ts";

/** Conversational fallback shown when an internal read tool fails. */
export const GRACEFUL_TOOL_FALLBACK_HE =
  "כדי לדייק לך את האפשרויות, מה הכי חשוב כרגע: מספר החדרים או התקציב?";

/** Conversational fallback for write/CRM actions that did not complete. */
export const GRACEFUL_ACTION_FALLBACK_HE =
  "רק שאדייק לפני שאני ממשיכה: על איזה נכס או איש קשר מדובר?";

/**
 * Record a tool/DB failure for developer debugging.
 * Fire-and-forget: never throws, never blocks the reply.
 */
export function logToolFailure(params: {
  functionName: string;
  tool: string;
  error: unknown;
  context?: Record<string, unknown>;
}): void {
  const message = params.error instanceof Error
    ? params.error.message
    : typeof params.error === "string"
      ? params.error
      : JSON.stringify(params.error ?? {});
  console.error(`[tool_failure] ${params.functionName}:${params.tool}`, message, params.context ?? {});
  void logIntegrationError({
    integration: "ai_gateway",
    functionName: params.functionName,
    errorCode: "tool_failure",
    errorMessage: `${params.tool}: ${message}`,
    context: { tool: params.tool, ...(params.context ?? {}) },
  });
}

/**
 * Run a tool/DB call and never let its raw error escape.
 * Returns `{ ok: false, fallback }` on failure so callers can answer gracefully.
 */
export async function safeTool<T>(
  meta: { functionName: string; tool: string; context?: Record<string, unknown> },
  fn: () => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; fallback: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    logToolFailure({ ...meta, error: e });
    return { ok: false, fallback: GRACEFUL_TOOL_FALLBACK_HE };
  }
}
