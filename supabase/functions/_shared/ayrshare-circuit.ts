// Ayrshare API circuit breaker.
//
// If Ayrshare returns HTTP 403 or error code 276 (account suspended) or a 429
// rate-limit, we open a persistent circuit stored in public.campaign_settings
// under the key `ayrshare_circuit_state`. While the circuit is open, EVERY
// outbound Ayrshare call short-circuits with a graceful 200 JSON response —
// no fetches to Ayrshare, no cron dispatches, no analytics polling — until
// the cooldown expires OR an admin manually resets it.
//
// This is the last line of defence against the "aggressive retry loop" that
// gets our shared provider profile suspended repeatedly.

const KEY = "ayrshare_circuit_state";

export interface CircuitState {
  until_ms: number;
  reason: string;
  status?: number;
  code?: number | string;
  message?: string;
  opened_at: number;
}

export async function readCircuit(admin: any): Promise<CircuitState | null> {
  try {
    const { data } = await admin
      .from("campaign_settings")
      .select("value")
      .eq("key", KEY)
      .maybeSingle();
    if (!data?.value) return null;
    const parsed = JSON.parse(String(data.value)) as CircuitState;
    if (!parsed?.until_ms) return null;
    if (parsed.until_ms <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function tripCircuit(
  admin: any,
  args: {
    reason: string;
    status?: number;
    code?: number | string;
    message?: string;
    ttlMs?: number;
  },
): Promise<CircuitState> {
  const ttl = args.ttlMs ??
    (args.status === 429 ? 15 * 60_000 : 24 * 3600_000);
  const state: CircuitState = {
    until_ms: Date.now() + ttl,
    reason: args.reason,
    status: args.status,
    code: args.code,
    message: args.message,
    opened_at: Date.now(),
  };
  try {
    await admin
      .from("campaign_settings")
      .upsert(
        { key: KEY, value: JSON.stringify(state) },
        { onConflict: "key" },
      );
    console.warn("[ayrshare-circuit] TRIPPED", state);
  } catch (e) {
    console.warn("[ayrshare-circuit] persist failed", e);
  }
  return state;
}

/**
 * Inspect an Ayrshare fetch response; if it indicates suspension (403/276) or
 * rate limit (429), trip the circuit. Call this after every outbound Ayrshare
 * fetch that returns non-ok.
 */
export async function tripOnAyrshareFailure(
  admin: any,
  status: number,
  payload: any,
  ctx: string,
): Promise<CircuitState | null> {
  const code = Number(
    payload?.code ?? payload?.errors?.[0]?.code ?? payload?.raw?.code ?? 0,
  );
  const msg = String(
    payload?.message ?? payload?.error ?? payload?.errors?.[0]?.message ??
      payload?.raw?.message ?? "",
  );
  if (status === 429) {
    return await tripCircuit(admin, {
      reason: `rate_limited:${ctx}`,
      status,
      message: msg,
      ttlMs: 15 * 60_000,
    });
  }
  if (
    status === 403 || code === 276 ||
    /account has been suspended|suspended/i.test(msg)
  ) {
    return await tripCircuit(admin, {
      reason: `suspended:${ctx}`,
      status,
      code,
      message: msg,
      ttlMs: 24 * 3600_000,
    });
  }
  return null;
}

/** Compact, user-safe JSON to return when the circuit is open. */
export function circuitOpenPayload(state: CircuitState) {
  const untilIso = new Date(state.until_ms).toISOString();
  const untilLocal = new Date(state.until_ms).toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const isRate = state.reason.startsWith("rate_limited");
  return {
    success: false,
    fallback: true,
    circuit_open: true,
    error: isRate ? "RATE_LIMITED" : "ACCOUNT_SUSPENDED",
    reason: state.reason,
    until: untilIso,
    message: isRate
      ? `הפרסום מושהה עד ${untilLocal} להגנה מפני חסימת ספק (יותר מדי בקשות ל־Ayrshare).`
      : `הפרסום מושהה עד ${untilLocal}. פרופיל המדיה החברתית נחסם על ידי הספק — נדרש לחבר פרופיל חדש.`,
  };
}

/** Convenience: build the full 200 Response for edge functions. */
export function circuitOpenResponse(
  state: CircuitState,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(circuitOpenPayload(state)), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
