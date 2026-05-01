/**
 * trial-autopilot-dispatch
 * ─────────────────────────
 * Queues outbound trial messages for a Free Trial user via the System WBA.
 *
 * - Verifies user is on an active trial (≤7 days, plan_status='trial').
 * - Caps total queued+sent at 100 messages per user (trial_outbound_used()).
 * - Targets all of the user's voters (or a specific list if provided).
 * - Each message is scheduled with a randomized 30-60s gap so the system
 *   account never trips WhatsApp anti-spam.
 * - Inbound replies are handled by `trial-inbound-webhook` and do NOT
 *   consume the outbound quota.
 * - Messages are sent **without** any "Sent via Realtyz" branding.
 *
 * The actual provider POST happens in this same function for messages whose
 * `scheduled_for <= now()`. A pg_cron job (or simple delayed self-invocation)
 * picks up the rest. For the MVP we send all due rows synchronously inside
 * one invocation up to a small batch ceiling.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// System WBA credentials — admin secrets (never exposed to clients).
const SYSTEM_WBA_INSTANCE_ID = Deno.env.get("SYSTEM_WBA_INSTANCE_ID") ?? "";
const SYSTEM_WBA_TOKEN = Deno.env.get("SYSTEM_WBA_TOKEN") ?? "";

const TRIAL_CAP = 100;
const MIN_GAP_MS = 30_000;
const MAX_GAP_MS = 60_000;

interface DispatchBody {
  message_body: string;
  voter_ids?: string[]; // optional explicit subset
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimErr } =
      await userClient.auth.getClaims(token);
    if (claimErr || !claims?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = claims.claims.sub as string;

    const body: DispatchBody = await req.json().catch(() => ({}) as any);
    const messageBody = (body.message_body ?? "").trim();
    if (!messageBody || messageBody.length > 1000) {
      return json({ error: "message_body required (1-1000 chars)" }, 400);
    }

    // Use service role to read profile / voters / write queue.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Trial gate: only trial users with start_date within 7d.
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("plan_status, trial_start_date")
      .eq("id", userId)
      .maybeSingle();
    if (profErr) throw profErr;
    if (!profile) return json({ error: "Profile not found" }, 404);

    const isTrial = profile.plan_status === "trial";
    const startedAt = profile.trial_start_date
      ? new Date(profile.trial_start_date).getTime()
      : 0;
    const ageMs = Date.now() - startedAt;
    const trialActive = isTrial && ageMs >= 0 &&
      ageMs <= 7 * 24 * 60 * 60 * 1000;

    if (!trialActive) {
      return json({
        error: "TRIAL_EXPIRED",
        message: "תקופת הניסיון הסתיימה. יש לשדרג כדי להמשיך להפיץ קמפיינים",
      }, 403);
    }

    // Quota check.
    const { data: usedRow, error: usedErr } = await admin.rpc(
      "trial_outbound_used",
      { _user_id: userId },
    );
    if (usedErr) throw usedErr;
    const used = Number(usedRow ?? 0);
    const remaining = Math.max(0, TRIAL_CAP - used);
    if (remaining <= 0) {
      return json({
        error: "TRIAL_QUOTA_EXHAUSTED",
        message:
          "הגעת ל-100 הודעות בניסיון. שדרג למסלול בתשלום כדי להמשיך לשגר",
        used,
      }, 403);
    }

    // Pick recipients.
    let voters: Array<{ id: string; full_name: string; phone_number: string }>;
    if (body.voter_ids?.length) {
      const { data, error } = await admin.from("leads")
        .select("id, full_name, phone_number")
        .in("id", body.voter_ids);
      if (error) throw error;
      voters = data ?? [];
    } else {
      const { data, error } = await admin.from("leads")
        .select("id, full_name, phone_number")
        .eq("is_demo", false)
        .limit(remaining);
      if (error) throw error;
      voters = data ?? [];
    }

    voters = voters.filter((v) => v.phone_number).slice(0, remaining);
    if (voters.length === 0) {
      return json({ queued: 0, used, remaining }, 200);
    }

    // Build queue rows with staggered scheduled_for.
    const rows = voters.map((v, i) => {
      const gap = MIN_GAP_MS + Math.floor(Math.random() * (MAX_GAP_MS - MIN_GAP_MS));
      const scheduledFor = new Date(Date.now() + i * gap);
      return {
        user_id: userId,
        lead_id: v.id,
        recipient_phone: v.phone_number,
        recipient_name: v.full_name,
        message_body: personalize(messageBody, v.full_name),
        status: "queued",
        scheduled_for: scheduledFor.toISOString(),
      };
    });

    const { error: insErr } = await admin.from("trial_autopilot_messages")
      .insert(rows);
    if (insErr) throw insErr;

    // Send the first message immediately so the user sees something happen.
    const firstSentResult = await trySendOne(admin, userId);

    return json({
      queued: rows.length,
      used: used + rows.length,
      remaining: TRIAL_CAP - (used + rows.length),
      first_send: firstSentResult,
      delay_seconds: { min: MIN_GAP_MS / 1000, max: MAX_GAP_MS / 1000 },
    }, 200);
  } catch (e) {
    console.error("trial-autopilot-dispatch error:", e);
    return json({
      error: "INTERNAL",
      message: (e as Error).message,
    }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function personalize(template: string, name: string): string {
  return template.replace(/\[שם\]|\[name\]/gi, name || "")
    .replace(/\s+,/g, ",")
    .trim();
}

async function trySendOne(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ ok: boolean; provider_id?: string; error?: string }> {
  if (!SYSTEM_WBA_INSTANCE_ID || !SYSTEM_WBA_TOKEN) {
    return { ok: false, error: "system_wba_not_configured" };
  }
  // Pick the next due queued row for this user.
  const { data: row } = await admin
    .from("trial_autopilot_messages")
    .select("id, recipient_phone, message_body")
    .eq("user_id", userId)
    .eq("status", "queued")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!row) return { ok: false, error: "no_due_row" };

  await admin.from("trial_autopilot_messages")
    .update({ status: "sending" })
    .eq("id", row.id);

  try {
    // Route through unified send-whatsapp gateway (WBA → GreenAPI fallback).
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        phone_number: row.recipient_phone,
        message: row.message_body, // intentionally NO branding
        tenant_id: userId,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j?.success) {
      await admin.from("trial_autopilot_messages")
        .update({
          status: "failed",
          failure_reason: `gateway_${res.status}: ${JSON.stringify(j)}`.slice(
            0,
            500,
          ),
        })
        .eq("id", row.id);
      return { ok: false, error: `gateway_${res.status}` };
    }
    await admin.from("trial_autopilot_messages")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: j?.message_id ?? null,
      })
      .eq("id", row.id);
    return { ok: true, provider_id: j?.message_id ?? undefined };
  } catch (e) {
    await admin.from("trial_autopilot_messages")
      .update({
        status: "failed",
        failure_reason: (e as Error).message.slice(0, 500),
      })
      .eq("id", row.id);
    return { ok: false, error: (e as Error).message };
  }
}
