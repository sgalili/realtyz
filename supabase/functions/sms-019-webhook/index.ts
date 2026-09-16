/**
 * sms-019-webhook
 * ───────────────
 * PUBLIC endpoint (no JWT) wired into the 019 "URL mapping" panel. 019 posts
 * every inbound SMS here (JSON, form-encoded, XML or plain query string).
 *
 * The payload is parsed, the receiving workspace is resolved from the 019 DID,
 * the CRM contact is matched (or created), the message is stored in
 * public.messages so it shows instantly in /inbox, and Rita answers on the same
 * SMS channel — all in the shared handler, identical to `sms-inbound-webhook`.
 *
 * Optional shared secret: SMS_INBOUND_WEBHOOK_SECRET via `x-webhook-secret`
 * header or `?secret=` query parameter.
 */
import { handleSmsInbound } from "../_shared/smsInboundHandler.ts";

Deno.serve((req) => handleSmsInbound(req, "sms-019-webhook"));
