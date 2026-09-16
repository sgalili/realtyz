/**
 * sms-inbound-webhook
 * ───────────────────
 * PUBLIC endpoint (no JWT) for INBOUND SMS delivered by the 019 gateway.
 * The whole flow lives in `_shared/smsInboundHandler.ts` and is shared with
 * `sms-019-webhook` (the URL-mapping endpoint in the 019 panel).
 */
import { handleSmsInbound } from "../_shared/smsInboundHandler.ts";

Deno.serve((req) => handleSmsInbound(req, "sms-inbound-webhook"));
