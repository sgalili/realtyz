// telegram-webhook — native inbound receiver for Telegram Bot updates.
// Scoped strictly to the "אודי ויטמן" workspace (owner_id fixed).
// Persists inbound updates into public.messages with platform='telegram'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Hard-scoped workspace owner: אודי ויטמן.
const OWNER_ID = "8f66ac1a-070a-4485-ac3b-07697d6c4b9e";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TG_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  if (TG_SECRET) {
    const got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (got !== TG_SECRET) return json({ ok: false, error: "unauthorized" }, 401);
  }

  let update: any = {};
  try {
    update = await req.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  try {
    const msg = update.message ?? update.edited_message ?? update.channel_post ?? null;
    if (!msg) return json({ ok: true, ignored: true });

    const chatId = String(msg.chat?.id ?? "");
    const senderId = String(msg.from?.id ?? chatId);
    const senderHandle = msg.from?.username ?? msg.chat?.username ?? null;
    const firstName = msg.from?.first_name ?? msg.chat?.first_name ?? null;
    const text: string =
      msg.text ??
      msg.caption ??
      (msg.sticker ? "[מדבקה]" : msg.photo ? "[תמונה]" : "[עדכון טלגרם]");
    const updateId = String(update.update_id ?? msg.message_id ?? `${chatId}:${msg.date}`);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Upsert the binding so we know who this chat belongs to (Udi's ws only).
    try {
      await supabase.from("telegram_bindings").upsert(
        {
          owner_id: OWNER_ID,
          chat_id: chatId,
          handle: senderHandle,
          first_name: firstName,
          bound_at: new Date().toISOString(),
        },
        { onConflict: "chat_id" },
      );
    } catch (_) { /* non-fatal */ }

    // /start handshake — just ack.
    if (typeof text === "string" && text.trim().toLowerCase().startsWith("/start")) {
      return json({ ok: true, telegram_start: true });
    }

    // Try to match an existing lead by telegram handle stored in metadata.
    let leadId: string | null = null;
    const handleQ = senderHandle
      ? String(senderHandle).replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "")
      : null;
    if (handleQ) {
      const { data: lead } = await supabase
        .from("leads")
        .select("id")
        .filter("preferences->>telegram_username", "eq", handleQ)
        .limit(1)
        .maybeSingle();
      leadId = (lead as any)?.id ?? null;
    }

    const { error } = await supabase.from("messages").insert({
      lead_id: leadId,
      platform: "telegram",
      channel: "telegram",
      direction: "inbound",
      sender_type: "voter",
      content: text,
      metadata: {
        source: "telegram_native_webhook",
        owner_id: OWNER_ID,
        chat_id: chatId,
        sender_id: senderId,
        sender_handle: senderHandle,
        first_name: firstName,
        update_id: updateId,
        raw: update,
      },
    });

    if (error) {
      console.error("[telegram-webhook] insert failed", error);
      return json({ ok: false, error: error.message }, 500);
    }

    return json({ ok: true });
  } catch (e) {
    // Never return non-2xx — Telegram would replay indefinitely.
    console.error("[telegram-webhook] unexpected", e);
    return json({ ok: true, logged: true }, 200);
  }
});
