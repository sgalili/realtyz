// Proxies a WhatsApp Cloud API media attachment so the browser can play it.
// Meta media URLs require the bearer token, so the client cannot fetch them
// directly. Call with ?media_id=<id> (or POST {media_id}) and receive the raw
// bytes with the original content-type.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

function centralToken(): { token: string; version: string } | null {
  const token =
    Deno.env.get("META_WA_ACCESS_TOKEN") ?? Deno.env.get("META_WHATSAPP_TOKEN") ?? "";
  if (!token) return null;
  return {
    token,
    version:
      Deno.env.get("META_WA_API_VERSION") ??
      Deno.env.get("META_API_VERSION") ??
      Deno.env.get("WHATSAPP_API_VERSION") ??
      "v26.0",
  };
}

async function workspaceToken(
  admin: ReturnType<typeof createClient>,
): Promise<string | null> {
  const { data } = await admin
    .from("wa_providers")
    .select("config, updated_at")
    .eq("provider_name", "WBA")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(5);
  for (const row of (data ?? []) as any[]) {
    const t = String(row?.config?.access_token ?? "").trim();
    if (t) return t;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let mediaId = url.searchParams.get("media_id") ?? "";
    if (!mediaId && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      mediaId = String((body as any)?.media_id ?? "");
    }
    mediaId = mediaId.replace(/\D/g, "");
    if (!mediaId) {
      return new Response(JSON.stringify({ error: "media_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const central = centralToken();
    const token = central?.token ?? (await workspaceToken(admin));
    const version = central?.version ?? "v26.0";
    if (!token) {
      return new Response(JSON.stringify({ error: "no_meta_token" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Resolve the short-lived download URL for this media id.
    const metaRes = await fetch(`https://graph.facebook.com/${version}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meta = await metaRes.json().catch(() => ({}));
    const fileUrl = String((meta as any)?.url ?? "");
    if (!metaRes.ok || !fileUrl) {
      return new Response(
        JSON.stringify({ error: (meta as any)?.error?.message ?? "media_lookup_failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Stream the bytes back with the original content type.
    const fileRes = await fetch(fileUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!fileRes.ok || !fileRes.body) {
      return new Response(JSON.stringify({ error: `media_download_${fileRes.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contentType =
      fileRes.headers.get("content-type") ??
      String((meta as any)?.mime_type ?? "application/octet-stream").split(";")[0];

    return new Response(fileRes.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
        "Accept-Ranges": "none",
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
