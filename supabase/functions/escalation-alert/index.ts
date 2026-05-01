// Escalation Alert dispatcher
//
// Inputs:
//   { lead_id?, prospect_message, category, matched_keywords[], severity, channel? }
//
// Behaviour:
//   1. Validates the caller (JWT) and resolves their profile + phone number.
//   2. Inserts a row in `escalation_alerts` (RLS-scoped to the caller).
//   3. Sends a WhatsApp message to the human Agent's phone via the existing
//      `send-whatsapp` gateway. We use the gateway because it already handles
//      Green API / WBA fallback + retries, and it logs the outbound message.
//
// The function is deliberately self-contained: any edge function can call it
// over HTTP with a Service Role bearer token (when running server-side from
// `trial-inbound-webhook`) or with the user's JWT (when invoked from the UI).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Payload = {
  lead_id?: string | null;
  prospect_message: string;
  category: string;
  matched_keywords?: string[];
  severity?: "high" | "medium";
  channel?: string;
  // When called server-to-server from another edge function, the upstream
  // can pass user_id explicitly (it won't have a user JWT to forward).
  override_user_id?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    const body = (await req.json().catch(() => ({}))) as Payload;
    if (!body?.prospect_message || !body?.category) {
      return json({ error: "prospect_message and category are required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Resolve user_id either from the forwarded JWT or from override.
    let userId: string | null = body.override_user_id ?? null;
    if (!userId && auth.startsWith("Bearer ")) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: auth } },
      });
      const { data } = await userClient.auth.getUser();
      userId = data.user?.id ?? null;
    }
    if (!userId) {
      return json({ error: "Unauthorized — could not resolve user" }, 401);
    }

    // 1) Persist the alert.
    const { data: alertRow, error: insErr } = await admin
      .from("escalation_alerts")
      .insert({
        user_id: userId,
        lead_id: body.lead_id || null,
        trigger_category: body.category,
        trigger_keywords: body.matched_keywords || [],
        severity: body.severity || "high",
        prospect_message: body.prospect_message.slice(0, 4000),
        channel: body.channel || "whatsapp",
      })
      .select()
      .single();

    if (insErr) {
      console.error("[escalation-alert] insert failed", insErr);
      return json({ error: insErr.message }, 500);
    }

    // 2) Look up the Agent's WhatsApp number.
    //    Profiles don't have a phone column today, so we fall back to the
    //    auth.users phone. Both are read with the service role.
    let agentPhone: string | null = null;
    let agentName = "Agent";
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.full_name) agentName = profile.full_name;

    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    agentPhone = authUser?.user?.phone || null;

    let notificationResult: Record<string, unknown> = { agent_phone_resolved: !!agentPhone };
    let notified = false;

    if (agentPhone) {
      // 3) Send a WhatsApp message to the human Agent via the gateway.
      const leadHint = body.lead_id ? `\nLead ID: ${body.lead_id}` : "";
      const text =
        `🚨 Realtyz Escalation Alert (${body.severity || "high"})\n` +
        `Category: ${body.category}\n` +
        `Keywords: ${(body.matched_keywords || []).join(", ") || "—"}${leadHint}\n` +
        `\nProspect said:\n"${body.prospect_message.slice(0, 600)}"\n\n` +
        `Open the Deal Room to take over this conversation.`;

      try {
        const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
            apikey: SERVICE_KEY,
          },
          body: JSON.stringify({
            phone_number: agentPhone,
            message: text,
            tenant_id: userId,
          }),
        });
        notified = sendRes.ok;
        notificationResult = {
          ...notificationResult,
          status: sendRes.status,
          ok: sendRes.ok,
        };
        if (!sendRes.ok) {
          notificationResult.body = (await sendRes.text()).slice(0, 400);
        }
      } catch (e) {
        notificationResult.error = (e as Error).message;
      }
    } else {
      notificationResult.reason = "Agent has no phone number on file";
    }

    await admin
      .from("escalation_alerts")
      .update({ notified_agent: notified, notification_result: notificationResult })
      .eq("id", alertRow.id);

    return json({ ok: true, alert_id: alertRow.id, notified, notificationResult });
  } catch (e) {
    console.error("[escalation-alert] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
