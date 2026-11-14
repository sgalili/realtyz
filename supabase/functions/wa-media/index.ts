// Proxies a WhatsApp Cloud API media attachment so the browser can play it.
// Meta media URLs require the bearer token, so the client cannot fetch them
// directly. Call with ?media_id=<id> (or POST {media_id}) and receive the raw
// bytes with the original content-type.
import { requireCaller, enforceRequestScope } from "../_shared/authz.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

import { mediaCredentials, mediaLookupFailure, safeMetaMediaUrl, type MediaCredential } from "../_shared/waMediaAccess.ts";

function centralToken(): MediaCredential | null {
  const accessToken = Deno.env.get("META_WA_ACCESS_TOKEN") || Deno.env.get("META_WHATSAPP_TOKEN") || "";
  if (!accessToken) return null;
  return { accessToken, apiVersion: Deno.env.get("META_WA_API_VERSION") || Deno.env.get("META_API_VERSION") || "v26.0", phoneNumberId: Deno.env.get("META_WA_PHONE_NUMBER_ID") || Deno.env.get("META_PHONE_NUMBER_ID") || "" };
}
function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const __caller = await requireCaller(req, ["service", "user"]);
  if (__caller instanceof Response) return __caller;
  const __scope = await enforceRequestScope(req, __caller);
  if (__scope) return __scope;

  try {
    const url = new URL(req.url);
    let mediaId = url.searchParams.get("media_id") ?? "";
    if (!mediaId && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      mediaId = String((body as any)?.media_id ?? "");
    }
    if (!/^\d+$/.test(mediaId)) {
      return new Response(JSON.stringify({ error: "media_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Resolve the actual visible message before selecting any credential.
    const db = __caller.kind === "user" ? createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: `Bearer ${__caller.token}` } }, auth: { persistSession: false },
    }) : admin;
    const types = ["image", "audio", "video", "document", "sticker", "voice"];
    const { data: owned, error: messageError } = await db.from("messages").select("id, lead_id, metadata")
      .or(types.map(t => `metadata->raw->${t}->>id.eq.${mediaId}`).join(",")).limit(1);
    const message = owned?.[0];
    if (messageError || !message) return json({ error: "forbidden" }, 403);
    const { data: lead } = await admin.from("leads").select("workspace_owner_id").eq("id", message.lead_id).maybeSingle();
    const phoneId = String(message.metadata?.phone_number_id ?? "");
    const { data: providers, error: providerError } = await admin.from("wa_providers")
      .select("user_id, tenant_id, config").eq("provider_name", "WBA").eq("is_active", true).eq("is_official", true)
      .order("updated_at", { ascending: false });
    if (providerError) return json({ error: "media_configuration_unavailable" }, 503);
    const credentials = mediaCredentials(providers ?? [], phoneId, lead?.workspace_owner_id ?? "", centralToken());
    if (!credentials.length) return json({ error: "media_credentials_missing", stage: "credentials" }, 503);

    let fileUrl = "";
    let token = "";
    let mimeType = "application/octet-stream";
    let unavailable = false;
    let reason = "provider_error";
    for (const credential of credentials) {
      const metaRes = await fetch(`https://graph.facebook.com/${credential.apiVersion}/${mediaId}`, {
        headers: { Authorization: `Bearer ${credential.accessToken}` }, signal: AbortSignal.timeout(20000),
      });
      const meta = await metaRes.json().catch(() => ({}));
      if (metaRes.ok && safeMetaMediaUrl(String(meta?.url ?? ""))) {
        fileUrl = String(meta.url); token = credential.accessToken; mimeType = String(meta.mime_type ?? mimeType); break;
      }
      const failure = mediaLookupFailure(metaRes.status, meta?.error);
      unavailable = unavailable || failure.unavailable; reason = failure.reason;
      console.warn("[wa-media] lookup failed", { stage: "lookup", http_status: metaRes.status, provider_code: meta?.error?.code, provider_subcode: meta?.error?.error_subcode, reason, message_id: message.id });
    }
    if (!fileUrl) return unavailable
      ? json({ available: false, error: "media_unavailable", reason: "expired_or_inaccessible", stage: "lookup" })
      : json({ error: "media_lookup_failed", reason, stage: "lookup" }, 503);

    // 2. Stream the bytes back with the original content type.
    const fileRes = await fetch(fileUrl, { headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(20000) });
    if (!fileRes.ok || !fileRes.body) {
      console.warn("[wa-media] download failed", { stage: "download", http_status: fileRes.status, message_id: message.id });
      return fileRes.status === 404 || fileRes.status === 410
        ? json({ available: false, error: "media_unavailable", stage: "download" })
        : json({ error: "media_download_failed", stage: "download" }, 503);
    }
    const contentType = fileRes.headers.get("content-type") ?? mimeType.split(";")[0];

    return new Response(fileRes.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
        "Accept-Ranges": "none",
      },
    });
  } catch (e) {
    console.warn("[wa-media] request failed", { stage: "request", reason: e instanceof Error ? e.name : "unknown" });
    return json({ error: "media_temporarily_unavailable", stage: "request" }, 503);
  }
});
