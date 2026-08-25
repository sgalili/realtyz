// meta-dm-webhook — realtime inbound Messenger / Instagram direct messages.
//
// Meta setup: subscribe the Page to the `messages` field (object=page) and the
// IG account to `messages` (object=instagram), pointing both callback URLs here.
//   GET  → hub.challenge verification (META_DM_VERIFY_TOKEN, falls back to the
//          shared verify-token secrets)
//   POST → entry[].messaging[] events are stored instantly in public.messages.
//
// Public endpoint: Meta cannot send an Authorization header, so the verify
// token guards the subscription and the Page binding guards the routing.
import { corsHeaders } from "../_shared/cors.ts";
import { graphCall, metaAdminClient, ownerForPage } from "../_shared/metaPage.ts";
import { dmText, type InboundDm, persistInboundDm } from "../_shared/metaDm.ts";
import { logIntegrationError } from "../_shared/logIntegrationError.ts";

const verifyToken = () =>
  Deno.env.get("META_DM_VERIFY_TOKEN") ??
  Deno.env.get("META_COMMENTS_VERIFY_TOKEN") ??
  Deno.env.get("MESSENGER_VERIFY_TOKEN") ??
  Deno.env.get("WA_VERIFY_TOKEN") ??
  Deno.env.get("VERIFY_TOKEN") ??
  Deno.env.get("META_WA_VERIFY_TOKEN") ??
  null;

/** Best-effort display name for a PSID / IGSID. */
async function profileName(senderId: string, token: string): Promise<string | null> {
  const r = await graphCall(
    `/${senderId}?fields=name,username,first_name,last_name&access_token=${encodeURIComponent(token)}`,
  );
  if (!r.ok) return null;
  const p = r.payload ?? {};
  const composed = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  const name = p.name || composed || p.username || "";
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ---- Meta subscription handshake ----------------------------------------
  if (req.method === "GET") {
    const url = new URL(req.url);
    const expected = verifyToken();
    if (
      url.searchParams.get("hub.mode") === "subscribe" &&
      expected &&
      url.searchParams.get("hub.verify_token") === expected
    ) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method", { status: 405 });

  let payload: any = null;
  try { payload = await req.json(); } catch { payload = null; }

  const process = async () => {
    try {
      const admin = metaAdminClient();
      const object = String(payload?.object ?? "");
      const platform: InboundDm["platform"] = object === "instagram" ? "instagram" : "messenger";

      for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
        const events: any[] = Array.isArray(entry?.messaging)
          ? entry.messaging
          : Array.isArray(entry?.standby)
          ? entry.standby
          : [];
        if (events.length === 0) continue;

        // Route by the receiving Page id: prefer the recipient on the event
        // (for IG the entry id is the IG account id, not the Page id).
        const candidates = [
          ...events.map((e) => String(e?.recipient?.id ?? "")),
          String(entry?.id ?? ""),
        ].filter(Boolean);
        let binding = null as Awaited<ReturnType<typeof ownerForPage>>;
        for (const id of candidates) {
          binding = await ownerForPage(admin, id);
          if (binding?.ownerId) break;
        }
        if (!binding?.ownerId) {
          console.warn("[meta-dm-webhook] no page binding for", candidates.join(","));
          continue;
        }

        for (const ev of events) {
          const msg = ev?.message;
          if (!msg || msg?.is_echo) continue; // skip our own outbound echoes
          const text = dmText(msg?.text);
          if (!text) continue; // attachments-only payloads are ignored for now
          const senderId = String(ev?.sender?.id ?? "").trim();
          if (!senderId) continue;

          const dm: InboundDm = {
            platform,
            messageId: msg?.mid ? String(msg.mid) : null,
            senderId,
            senderName: await profileName(senderId, binding.token),
            text,
            createdAt: ev?.timestamp
              ? new Date(Number(ev.timestamp)).toISOString()
              : new Date().toISOString(),
          };
          await persistInboundDm(admin, binding.ownerId, dm, "meta-dm-webhook");
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[meta-dm-webhook] processing failed", message, e instanceof Error ? e.stack : "");
      await logIntegrationError({
        integration: "meta",
        functionName: "meta-dm-webhook",
        errorMessage: `${message}${e instanceof Error && e.stack ? `\n${e.stack}` : ""}`,
        context: { object: payload?.object ?? null },
      });
    }
  };

  // @ts-ignore Deno edge runtime background task API.
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(process());
  else await process();

  return new Response("EVENT_RECEIVED", { status: 200 });
});
