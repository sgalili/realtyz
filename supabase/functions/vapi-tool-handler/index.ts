// Vapi tool-call webhook receiver.
// Vapi posts here whenever the assistant invokes one of the function tools
// declared in vapi-outbound-call (send_whatsapp, send_sms_019, schedule_followup).
//
// Routes:
//   send_whatsapp   -> send-whatsapp edge fn (GreenAPI/WBA, preview_url=false)
//   send_sms_019    -> 019 SMS XML gateway (inline, identical to dispatch-campaign)
//   schedule_followup -> writes a row to autopilot_queue for Twilio/Vapi cron pickup
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

function escapeXml(s: string) {
  return String(s).replace(/[<>&'"]/g, (c) => (
    { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" } as any
  )[c]);
}

async function sendSms019(user: string, password: string, phone: string, body: string) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sms>
  <user><username>${escapeXml(user)}</username><password>${escapeXml(password)}</password></user>
  <source>Realtyz</source>
  <destinations><phone>${escapeXml(phone)}</phone></destinations>
  <message>${escapeXml(body)}</message>
</sms>`;
  const res = await fetch("https://www.019sms.co.il:8090/api", {
    method: "POST",
    headers: { "Content-Type": "application/xml; charset=UTF-8" },
    body: xml,
  });
  const text = await res.text();
  const status = parseInt(text.match(/<status>(-?\d+)<\/status>/)?.[1] ?? "-1", 10);
  return { ok: status === 0, raw: text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const userId = req.headers.get("x-realtyz-user") || "";
    const leadId = req.headers.get("x-realtyz-lead") || null;

    const payload = await req.json().catch(() => ({}));
    // Vapi tool-call payload shape: { message: { type: "tool-calls", toolCallList: [{ id, function: { name, arguments } }] } }
    const toolCalls = payload?.message?.toolCallList ?? payload?.toolCallList ?? [];
    const results: any[] = [];

    for (const tc of toolCalls) {
      const name = tc?.function?.name as string;
      const args = typeof tc?.function?.arguments === "string"
        ? JSON.parse(tc.function.arguments || "{}")
        : (tc?.function?.arguments ?? {});
      try {
        if (name === "send_whatsapp") {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
            method: "POST",
            headers: { Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              phone_number: args.phone,
              message: args.message,
              lead_id: leadId || undefined,
              ai_assisted: true,
            }),
          });
          const json = await res.json().catch(() => ({}));
          results.push({ toolCallId: tc.id, result: json?.success ? "נשלח בוואטסאפ" : `כשל: ${json?.error ?? "unknown"}` });
        } else if (name === "send_sms_019") {
          const { data: rows } = await admin
            .from("api_configs")
            .select("api_key")
            .eq("service_name", "019 SMS")
            .eq("is_active", true)
            .maybeSingle();
          const creds = String(rows?.api_key ?? "").split(":");
          if (creds.length < 2) {
            results.push({ toolCallId: tc.id, result: "019 SMS לא מוגדר" });
          } else {
            const r = await sendSms019(creds[0], creds.slice(1).join(":"), args.phone, args.message);
            results.push({ toolCallId: tc.id, result: r.ok ? "נשלח ב-SMS" : "כשל בשליחת SMS" });
          }
        } else if (name === "schedule_followup") {
          await admin.from("autopilot_queue").insert({
            user_id: userId,
            lead_id: leadId,
            scheduled_for: args.when_iso,
            payload: { kind: "vapi_followup", note: args.note ?? "" },
          } as any);
          results.push({ toolCallId: tc.id, result: "נקבע חיוג חוזר" });
        } else {
          results.push({ toolCallId: tc.id, result: `כלי לא מוכר: ${name}` });
        }
      } catch (e) {
        results.push({ toolCallId: tc.id, result: `שגיאה: ${(e as Error).message}` });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[vapi-tool-handler] fatal", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
