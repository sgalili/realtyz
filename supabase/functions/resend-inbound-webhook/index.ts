/**
 * resend-inbound-webhook
 * ──────────────────────
 * Public endpoint for Resend's Inbound Email webhook. Receives replies to
 * the broker's mailbox, resolves the sender to an existing RZ lead by email
 * (workspace-wide), and writes the reply into public.messages as an inbound
 * `email` message so it appears in the unified inbox.
 *
 * No JWT (public endpoint). Optionally protected by RESEND_WEBHOOK_SECRET
 * forwarded via x-webhook-secret header.
 *
 * RZ adaptation: writes lead_id (not voter_id) and resolves leads workspace-
 * wide (no MAILBOX_TO_OWNER_EMAIL hardcoding — RZ is a single workspace).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, svix-id, svix-signature, svix-timestamp",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function extractEmail(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") {
    const m = value.match(/<([^>]+)>/);
    return (m ? m[1] : value).trim().toLowerCase();
  }
  if (Array.isArray(value)) return extractEmail(value[0]);
  if (typeof value === "object") {
    const v: any = value;
    return String(v.email ?? v.address ?? "").trim().toLowerCase();
  }
  return "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripQuotedReply(text: string): string {
  if (!text) return "";
  const markers = [
    /\n[-]{2,}\s*Original Message\s*[-]{2,}/i,
    /\nOn .+ wrote:\s*$/m,
    /\nבתאריך .+ כתב\/ה:?/,
    /\n>+\s/,
  ];
  let out = text;
  for (const re of markers) {
    const m = out.match(re);
    if (m && m.index !== undefined) out = out.slice(0, m.index);
  }
  return out.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  if (WEBHOOK_SECRET) {
    const provided = req.headers.get("x-webhook-secret") ?? "";
    if (provided !== WEBHOOK_SECRET) return json({ error: "unauthorized" }, 401);
  }

  let payload: any = {};
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  try {
    if (ct.includes("application/json")) {
      payload = await req.json();
    } else if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
      const form = await req.formData();
      payload = Object.fromEntries([...form.entries()]);
    } else {
      const raw = await req.text();
      try { payload = JSON.parse(raw); } catch { payload = { text: raw }; }
    }
  } catch {
    return json({ error: "invalid_payload" }, 400);
  }

  const data = payload?.data ?? payload ?? {};
  const fromEmail = extractEmail(
    data.from ?? data.From ?? data.sender ?? data?.envelope?.from ??
    data?.FromFull?.Email ?? data?.headers?.From,
  );
  const toEmail = extractEmail(
    data.to ?? data.To ?? data.recipient ?? data?.envelope?.to ??
    data?.ToFull?.[0]?.Email ?? data?.headers?.To,
  );
  const subject = String(data.subject ?? data.Subject ?? data?.headers?.Subject ?? "").trim();
  const rawText = String(
    data.text ?? data["body-plain"] ?? data.plain ?? data.TextBody ?? data?.body?.plain ?? "",
  ).trim();
  const html = String(
    data.html ?? data["body-html"] ?? data.HtmlBody ?? data?.body?.html ?? "",
  ).trim();
  const messageId = String(
    data.message_id ?? data["Message-Id"] ?? data["message-id"] ??
    data.MessageID ?? data.id ?? payload?.message_id ?? "",
  ).trim();

  const bodyText = stripQuotedReply(rawText || (html ? stripHtml(html) : ""));
  if (!fromEmail) return json({ error: "missing_from", payload_keys: Object.keys(data) }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Workspace-wide lead resolution by email
  const { data: leadRow } = await supabase
    .from("leads")
    .select("id")
    .ilike("email", fromEmail)
    .limit(1)
    .maybeSingle();

  if (!leadRow?.id) {
    console.warn(`[resend-inbound] no lead matches sender ${fromEmail}`);
    return json({ ok: true, skipped: "no_lead_match", from: fromEmail }, 202);
  }
  const leadId = leadRow.id as string;

  const content = (subject ? `[${subject}]\n\n` : "") + (bodyText || "(הודעת מייל ריקה)");

  const { error: insertError, data: inserted } = await supabase
    .from("messages")
    .insert({
      lead_id: leadId,
      sender_type: "voter",
      direction: "inbound",
      channel: "email",
      platform: "email",
      content,
      metadata: {
        source: "resend_inbound_webhook",
        provider: "resend",
        provider_message_id: messageId || null,
        from: fromEmail,
        to: toEmail,
        subject,
      },
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("[resend-inbound] insert failed:", insertError);
    return json({ error: "insert_failed", detail: insertError.message }, 500);
  }

  // Bump lead's last_interaction_at if column exists (best-effort)
  try {
    await supabase
      .from("leads")
      .update({ last_interaction_at: new Date().toISOString() })
      .eq("id", leadId);
  } catch { /* ignore */ }

  return json({ ok: true, message_id: inserted?.id, lead_id: leadId });
});
