/**
 * Shared plumbing for the automated engagement cron jobs
 * (lease expiry, birthday/holiday greetings, post-tour feedback).
 *
 * Safety rails, per the platform rules for background AI/messaging jobs:
 *  - bounded batch per run (caller supplies the limit)
 *  - DB single-flight lease via acquire_scheduler_lock / release_scheduler_lock
 *  - idempotent progress marking (engagement_message_log unique job+dedupe_key)
 *  - circuit breaker: 402/403 pauses the job and stops the whole run
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

/** Today in Israel time, as { y, m, d } plus an ISO date string. */
export function israelToday(): { y: number; m: number; d: number; iso: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = parts.split("-").map(Number);
  return { y, m, d, iso: `${parts}` };
}

export function addDaysIso(iso: string, days: number): string {
  const dt = new Date(`${iso}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function firstName(fullName?: string | null): string {
  return String(fullName ?? "").trim().split(/\s+/)[0] ?? "";
}

export async function sendWhatsApp(payload: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

export type DispatchOutcome =
  | { kind: "sent" }
  | { kind: "duplicate" }
  | { kind: "failed"; status: number; error: string }
  | { kind: "halt"; status: number; error: string };

/**
 * Claims the dedupe key first, then sends. A duplicate claim means another run
 * already handled this item, so nothing is sent twice.
 */
export async function dispatchOnce(
  admin: SupabaseClient,
  job: string,
  args: {
    dedupeKey: string;
    leadId?: string | null;
    workspaceOwnerId?: string | null;
    phone: string;
    message: string;
    tenantId?: string | null;
    logAction?: string;
    logMetadata?: Record<string, unknown>;
  },
): Promise<DispatchOutcome> {
  const claim = await admin.from("engagement_message_log").insert({
    job_name: job,
    dedupe_key: args.dedupeKey,
    lead_id: args.leadId ?? null,
    workspace_owner_id: args.workspaceOwnerId ?? null,
    phone_number: args.phone,
    message: args.message,
    status: "pending",
  }).select("id").single();

  if (claim.error) {
    // 23505 = unique violation → already handled.
    if ((claim.error as { code?: string }).code === "23505") return { kind: "duplicate" };
    return { kind: "failed", status: 500, error: claim.error.message };
  }

  const sent = await sendWhatsApp({
    phone_number: args.phone,
    message: args.message,
    ...(args.tenantId ? { tenant_id: args.tenantId } : {}),
  });

  if (!sent.ok) {
    await admin.from("engagement_message_log")
      .update({ status: "failed", error: `${sent.status} ${sent.body}`.slice(0, 2000) })
      .eq("id", claim.data.id);
    const error = `${sent.status} ${sent.body}`.slice(0, 500);
    // Billing / policy blocks halt the entire job until the owner acts.
    if (sent.status === 402 || sent.status === 403) {
      await admin.from("scheduler_locks")
        .update({ paused: true, last_error: error, updated_at: new Date().toISOString() })
        .eq("job_name", job);
      return { kind: "halt", status: sent.status, error };
    }
    return { kind: "failed", status: sent.status, error };
  }

  await admin.from("engagement_message_log").update({ status: "sent" }).eq("id", claim.data.id);

  if (args.logAction && args.workspaceOwnerId) {
    await admin.from("interaction_activity_log").insert({
      user_id: args.workspaceOwnerId,
      action_type: args.logAction,
      platform: "whatsapp",
      content: args.message,
      actor_type: "ai",
      actor_label: "Rita",
      metadata: { lead_id: args.leadId ?? null, ...(args.logMetadata ?? {}) },
    });
  }

  return { kind: "sent" };
}

/** Wraps a job body in the paused-state guard + single-flight lease. */
export async function runJob(
  job: string,
  leaseSeconds: number,
  body: (admin: SupabaseClient) => Promise<Record<string, unknown>>,
): Promise<Response> {
  const admin = adminClient();
  const { data: locked, error: lockErr } = await admin.rpc("acquire_scheduler_lock", {
    _job: job,
    _lease_seconds: leaseSeconds,
    _worker: crypto.randomUUID(),
  });
  if (lockErr) {
    console.error(`[${job}] lock error`, lockErr.message);
    return json({ ok: false, error: lockErr.message }, 500);
  }
  if (!locked) return json({ ok: true, skipped: "locked_or_paused" });

  let lastError: string | null = null;
  try {
    const result = await body(admin);
    if (typeof result.lastError === "string") lastError = result.lastError;
    return json({ ok: true, ...result });
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    console.error(`[${job}]`, lastError);
    return json({ ok: false, error: lastError }, 500);
  } finally {
    await admin.rpc("release_scheduler_lock", { _job: job, _error: lastError });
  }
}
