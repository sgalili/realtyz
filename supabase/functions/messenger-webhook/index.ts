// messenger-webhook — native Facebook Page Messenger receiver.
// GET  = hub.challenge verification handshake.
// POST = incoming messaging events, persisted to public.messages (platform='messenger').
// Scoped strictly to the "אודי ויטמן" workspace (owner_id fixed).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const OWNER_ID = "8f66ac1a-070a-4485-ac3b-07697d6c4b9e";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERIFY_TOKEN = Deno.env.get("MESSENGER_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";

function verifySignature(rawBody: string, header: string | null): boolean {
  if (!APP_SECRET) return true; // if unset, skip check (dev)
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", APP_SECRET).update(rawBody).digest("hex");
  const got = header.slice(7);
  if (expected.length !== got.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // GET — Meta verification handshake.
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200, headers: corsHeaders });
    }
    return json({ ok: false, error: "verification_failed" }, 403);
  }

  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return json({ ok: false, error: "bad_signature" }, 401);
  }

  let body: any = {};
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  try {
    if (body.object !== "page") return json({ ok: true, ignored: true });
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    for (const entry of body.entry ?? []) {
      const pageId = String(entry.id ?? "");
      for (const evt of entry.messaging ?? []) {
        const senderPsid = String(evt.sender?.id ?? "");
        const recipientPageId = String(evt.recipient?.id ?? pageId);
        // Ignore echoes of our own outbound.
        if (senderPsid === recipientPageId) continue;
        const text: string =
          evt.message?.text ??
          (evt.message?.attachments ? "[קובץ מצורף]" : evt.postback?.title ?? "[אירוע Messenger]");

        // Match binding — must exist AND belong to Udi. If not, skip (not our page).
        const { data: binding } = await supabase
          .from("messenger_page_bindings")
          .select("owner_id, page_id")
          .eq("page_id", recipientPageId)
          .eq("owner_id", OWNER_ID)
          .maybeSingle();
        if (!binding) continue;

        // Try to match lead by facebook_psid stored in preferences.
        let leadId: string | null = null;
        const { data: lead } = await supabase
          .from("leads")
          .select("id")
          .filter("preferences->>facebook_psid", "eq", senderPsid)
          .limit(1)
          .maybeSingle();
        leadId = (lead as any)?.id ?? null;

        const { error } = await supabase.from("messages").insert({
          lead_id: leadId,
          platform: "messenger",
          channel: "messenger",
          direction: "inbound",
          sender_type: "voter",
          content: text,
          metadata: {
            source: "messenger_native_webhook",
            owner_id: OWNER_ID,
            page_id: recipientPageId,
            sender_psid: senderPsid,
            mid: evt.message?.mid ?? null,
            timestamp: evt.timestamp ?? null,
            raw: evt,
          },
        });
        if (error) console.error("[messenger-webhook] insert failed", error);
      }
    }
    return json({ ok: true });
  } catch (e) {
    console.error("[messenger-webhook] unexpected", e);
    return json({ ok: true, logged: true }, 200);
  }
});
