// Public webhook endpoint Homely calls back into. Each broker has a unique token
// embedded in the URL: POST /homely-webhook?token=<token>  (also accepts /:token suffix).
// Logs every payload to homely_inbound_events. If event_type='lead_created' or
// payload contains a phone, upserts into public.leads.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(raw: string): string {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) return "972" + d.slice(1);
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    // token may be in querystring (?token=) or as final path segment
    let token = url.searchParams.get("token") || "";
    if (!token) {
      const parts = url.pathname.split("/").filter(Boolean);
      const idx = parts.indexOf("homely-webhook");
      if (idx >= 0 && parts[idx + 1]) token = parts[idx + 1];
    }
    if (!token || token.length < 16) return json({ error: "missing_or_invalid_token" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: cred } = await admin
      .from("homely_broker_credentials")
      .select("user_id, connection_status")
      .eq("webhook_token", token)
      .maybeSingle();

    if (!cred) return json({ error: "unknown_token" }, 404);
    const ownerId = (cred as any).user_id as string;
    if ((cred as any).connection_status === "disabled_by_admin") {
      return json({ error: "broker_disabled" }, 403);
    }

    const payload = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const eventType = (payload as any)?.event_type || (payload as any)?.type || "unknown";

    // Always log
    const { data: evt } = await admin.from("homely_inbound_events").insert({
      user_id: ownerId,
      event_type: eventType,
      payload,
    }).select("id").single();

    // Lead create / update heuristics
    const phoneRaw = (payload as any)?.phone || (payload as any)?.phone_number;
    const phone = phoneRaw ? normalizePhone(String(phoneRaw)) : "";
    let processed = false;
    let note = "logged_only";

    if (phone) {
      // Check existence
      const { data: existing } = await admin
        .from("leads")
        .select("id")
        .eq("phone_number", phone)
        .maybeSingle();

      if (!existing) {
        const { error: insErr } = await admin.from("leads").insert({
          phone_number: phone,
          full_name: (payload as any)?.name || (payload as any)?.full_name || "—",
          email: (payload as any)?.email || null,
          city: (payload as any)?.city || null,
          interest_tag: (payload as any)?.interest || (payload as any)?.tag || "homely_inbound",
          assigned_to: ownerId,
          is_demo: false,
          preferences: (payload as any)?.preferences || {},
        } as any);
        processed = !insErr;
        note = insErr ? `insert_failed:${insErr.message}` : "lead_created";
      } else {
        // Optional stage update
        const newStage = (payload as any)?.stage || (payload as any)?.status;
        if (newStage) {
          const { error: upErr } = await admin
            .from("leads")
            .update({ lead_stage: String(newStage) } as any)
            .eq("id", (existing as any).id);
          processed = !upErr;
          note = upErr ? `update_failed:${upErr.message}` : "lead_stage_updated";
        } else {
          processed = true;
          note = "lead_already_exists";
        }
      }
    }

    if (evt?.id) {
      await admin
        .from("homely_inbound_events")
        .update({ processed, processing_note: note })
        .eq("id", (evt as any).id);
    }

    return json({ ok: true, processed, note });
  } catch (e) {
    console.error("[homely-webhook] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
