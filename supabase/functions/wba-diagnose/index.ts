/**
 * wba-diagnose
 * ────────────
 * Read-only health check for the tenant's official Meta WhatsApp Business
 * (WBA) configuration. Sends NO messages. Never returns the access token.
 *
 * Returns: { configured, phone_number_id, api_version, graph_ok, graph_status,
 *            graph_error, display_phone_number, verified_name,
 *            quality_rating, throughput, templates }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    let userId: string | null = null;
    if (token && token !== SERVICE_ROLE_KEY) {
      const authed = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data } = await authed.auth.getUser();
      userId = data?.user?.id ?? null;
    }
    if (!userId) return json({ error: "unauthorized" }, 401);

    const { data: rows } = await admin
      .from("wa_providers")
      .select("provider_name, config, is_official, is_active")
      .eq("user_id", userId)
      .eq("is_active", true);

    const wba = (rows ?? []).find(
      (r: any) => r.provider_name === "WBA" && r.is_official === true,
    ) as any;

    if (!wba) {
      return json({
        configured: false,
        reason: "no_active_wba_provider_row",
        green_api_fallback: (rows ?? []).some((r: any) => r.provider_name === "GreenAPI"),
      });
    }

    const cfg = (wba.config ?? {}) as Record<string, unknown>;
    const phoneNumberId = String(cfg.phone_number_id ?? "");
    const accessToken = String(cfg.access_token ?? "");
    const wabaId = String(cfg.waba_id ?? "");
    const apiVersion = String(cfg.api_version ?? "v21.0");

    if (!phoneNumberId || !accessToken) {
      return json({
        configured: false,
        reason: "missing_phone_number_id_or_token",
        has_phone_number_id: !!phoneNumberId,
        has_access_token: !!accessToken,
      });
    }

    const fields = [
      "display_phone_number",
      "verified_name",
      "quality_rating",
      "code_verification_status",
      "platform_type",
      "throughput",
    ].join(",");

    const res = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=${fields}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const body = await res.json().catch(() => ({}));

    // Approved message templates (needed for out-of-24h-window sends).
    let templates: Array<{ name: string; language: string; status: string; category?: string }> = [];
    let templates_error: string | null = null;
    if (wabaId) {
      const tRes = await fetch(
        `https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates?fields=name,language,status,category&limit=50`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const tBody = await tRes.json().catch(() => ({}));
      if (tRes.ok && Array.isArray(tBody?.data)) {
        templates = tBody.data.map((t: any) => ({
          name: t.name,
          language: t.language,
          status: t.status,
          category: t.category,
        }));
      } else {
        templates_error = tBody?.error?.message ?? `HTTP ${tRes.status}`;
      }
    }

    return json({
      configured: true,
      phone_number_id: phoneNumberId,
      waba_id: wabaId ? `${wabaId.slice(0, 4)}…${wabaId.slice(-4)}` : null,
      api_version: apiVersion,
      graph_ok: res.ok,
      graph_status: res.status,
      graph_error: res.ok
        ? null
        : {
            message: body?.error?.message ?? null,
            code: body?.error?.code ?? null,
            subcode: body?.error?.error_subcode ?? null,
            type: body?.error?.type ?? null,
          },
      display_phone_number: body?.display_phone_number ?? null,
      verified_name: body?.verified_name ?? null,
      quality_rating: body?.quality_rating ?? null,
      code_verification_status: body?.code_verification_status ?? null,
      platform_type: body?.platform_type ?? null,
      throughput: body?.throughput ?? null,
      approved_templates: templates.filter((t) => t.status === "APPROVED"),
      all_templates: templates,
      templates_error,
    });
  } catch (e) {
    return json({ error: "diagnose_failed", details: String((e as Error)?.message ?? e) }, 500);
  }
});
