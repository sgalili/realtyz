/**
 * closing-doc-reminder-cron
 * -------------------------
 * Runs hourly. Finds closing_documents where:
 *   - status IN ('sent','viewed')
 *   - sent_at <= now() - 24 hours
 *   - reminder_sent_at IS NULL
 *
 * Sends a gentle WhatsApp reminder including the sign link, then sets
 * reminder_sent_at = now(). Documents past their expires_at are flipped
 * to status='expired' as a side effect.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") || "https://app.realtyz.ai";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // 1) Expire stale ones
  const { count: expiredCount } = await admin
    .from("closing_documents")
    .update({ status: "expired" })
    .in("status", ["sent", "viewed", "draft"])
    .lt("expires_at", now.toISOString())
    .select("id", { count: "exact", head: true });

  // 2) Find candidates needing reminders
  const { data: docs, error } = await admin
    .from("closing_documents")
    .select("id, lead_id, title, sign_token, sent_at, signer_name")
    .in("status", ["sent", "viewed"])
    .is("reminder_sent_at", null)
    .lte("sent_at", cutoff)
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  for (const doc of docs || []) {
    try {
      const signUrl = `${SITE_URL.replace(/\/$/, "")}/sign/${doc.sign_token}`;
      const message =
        `Hi ${doc.signer_name || "there"} 👋 — just a friendly reminder to review and sign your ${doc.title}. ` +
        `It only takes a minute:\n${signUrl}`;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
        },
        body: JSON.stringify({
          lead_id: doc.lead_id,
          message,
          ai_assisted: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success) {
        await admin
          .from("closing_documents")
          .update({ reminder_sent_at: now.toISOString() })
          .eq("id", doc.id);
        sent++;
      } else {
        console.error("reminder send failed for", doc.id, json);
      }
    } catch (e) {
      console.error("reminder loop error for", doc.id, e);
    }
  }

  return new Response(
    JSON.stringify({ checked: docs?.length ?? 0, reminders_sent: sent, expired: expiredCount ?? 0 }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
