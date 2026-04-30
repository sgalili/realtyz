// Inbound WhatsApp webhook: if message starts with /kb or #knowledge AND sender is whitelisted,
// ingest the message body into the owner's knowledge base. Otherwise, acknowledge.
// Normalized phone format: 9725XXXXXXXX.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  from: z.string().min(5),
  text: z.string().min(1),
  message_id: z.string().optional(),
  timestamp: z.string().optional(),
});

function normalizePhone(raw: string): string {
  let p = raw.replace(/\D/g, "");
  if (p.startsWith("0")) p = "972" + p.slice(1);
  if (!p.startsWith("972")) p = "972" + p;
  return p;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { from, text } = parsed.data;
    const trimmed = text.trim();
    const isKbCommand = /^(\/kb|#knowledge)\b/i.test(trimmed);
    if (!isKbCommand) {
      return new Response(JSON.stringify({ ingested: false, reason: "not_kb_command" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phone = normalizePhone(from);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: wl } = await admin
      .from("kb_whitelist")
      .select("user_id, label")
      .eq("phone_number", phone)
      .maybeSingle();

    if (!wl) {
      return new Response(JSON.stringify({ ingested: false, reason: "sender_not_whitelisted", phone }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // strip command prefix
    const body = trimmed.replace(/^(\/kb|#knowledge)\s*/i, "").trim();
    if (!body) {
      return new Response(JSON.stringify({ ingested: false, reason: "empty_body" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use first sentence as title (max 120 chars)
    const title = (body.split(/\n|\. /)[0] || body).slice(0, 120);

    // Call kb-ingest internally with service role (target_user_id)
    const ingestRes = await fetch(`${SUPABASE_URL}/functions/v1/kb-ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        target_user_id: wl.user_id,
        title: `WhatsApp · ${title}`,
        raw_text: body,
        source_type: "whatsapp",
        source_metadata: { phone, sender_label: wl.label },
      }),
    });
    const ingestJson = await ingestRes.json();

    return new Response(JSON.stringify({ ingested: ingestRes.ok, result: ingestJson }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("wa-kb-webhook error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
