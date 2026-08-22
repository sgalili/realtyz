/**
 * greenapi-session
 * ────────────────
 * Server-side bridge for the QR-session WhatsApp flow (Green API).
 * The browser never talks to Green API directly, so the instance token is
 * never exposed and there are no CORS problems.
 *
 * Actions (POST body { action }):
 *   - 'qr'      → fresh base64 QR image for linking the personal number
 *   - 'status'  → live connection status (connected / pending / error) + phone
 *   - 'logout'  → unlink the current number so another can be scanned
 *
 * Credentials are read from `workspace_whatsapp_settings` for the caller's
 * workspace owner. The resulting status is persisted back to that row so the
 * rest of the app (and send-whatsapp) sees the same state.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";
import {
  getLinkedPhone,
  getQrCode,
  getStateInstance,
  logoutInstance,
  type GreenApiCreds,
} from "../_shared/greenApi.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z.object({
  action: z.enum(["qr", "status", "logout"]),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // ── Auth: resolve the caller and their workspace owner ──────────────────
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) return json({ error: "לא מחובר" }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    const userId = userData?.user?.id ?? null;
    if (userErr || !userId) return json({ error: "לא מחובר" }, 401);

    const { data: prof } = await admin
      .from("profiles")
      .select("active_workspace_owner_id, workspace_owner_id")
      .eq("id", userId)
      .maybeSingle();
    const ownerId =
      (prof as any)?.active_workspace_owner_id ??
      (prof as any)?.workspace_owner_id ??
      userId;

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return json({ error: parsed.error.flatten().fieldErrors }, 400);
    }

    const { data: settings } = await admin
      .from("workspace_whatsapp_settings")
      .select("green_api_instance_id, green_api_token")
      .eq("workspace_owner_id", ownerId)
      .maybeSingle();

    const creds: GreenApiCreds = {
      instance_id: String((settings as any)?.green_api_instance_id ?? "").trim(),
      token: String((settings as any)?.green_api_token ?? "").trim(),
    };
    if (!creds.instance_id || !creds.token) {
      return json({ error: "חסרים פרטי Green API (Instance ID ו-API Token)" }, 400);
    }

    const persist = async (patch: Record<string, unknown>) => {
      await admin
        .from("workspace_whatsapp_settings")
        .update({ ...patch, last_checked_at: new Date().toISOString() })
        .eq("workspace_owner_id", ownerId);
    };

    // Point the instance at our inbound receiver the moment it is live, so
    // customer messages reach the CRM + AI autopilot with zero manual setup.
    const ensureWebhook = async () => {
      try {
        const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/greenapi-webhook`;
        await fetch(
          `https://api.green-api.com/waInstance${creds.instance_id}/setSettings/${creds.token}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              webhookUrl,
              webhookUrlToken: "",
              incomingWebhook: "yes",
              outgoingWebhook: "yes",
              outgoingMessageWebhook: "yes",
              outgoingAPIMessageWebhook: "yes",
              stateWebhook: "yes",
            }),
          },
        );
      } catch {
        /* non-blocking — the settings card exposes a manual sync too */
      }
    };

    // ── status ─────────────────────────────────────────────────────────────
    if (parsed.data.action === "status") {
      const state = await getStateInstance(creds);
      const phone = state.status === "connected" ? await getLinkedPhone(creds) : null;
      if (state.status === "connected") await ensureWebhook();
      await persist({
        qr_status: state.status,
        ...(phone ? { qr_phone: phone } : {}),
      });
      return json({ success: true, status: state.status, state: state.state, phone });
    }

    // ── logout ─────────────────────────────────────────────────────────────
    if (parsed.data.action === "logout") {
      const ok = await logoutInstance(creds);
      await persist({ qr_status: "disconnected", qr_phone: null });
      return json({ success: ok, status: "disconnected" });
    }

    // ── qr ─────────────────────────────────────────────────────────────────
    const qr = await getQrCode(creds);
    if (qr.kind === "qr") {
      await persist({ qr_status: "pending" });
      return json({ success: true, status: "pending", qr_image: qr.image });
    }
    if (qr.kind === "already_logged") {
      const phone = await getLinkedPhone(creds);
      await ensureWebhook();
      await persist({ qr_status: "connected", ...(phone ? { qr_phone: phone } : {}) });
      return json({ success: true, status: "connected", phone, qr_image: null });
    }
    await persist({ qr_status: "error" });
    return json({ success: false, status: "error", error: "לא ניתן להפיק קוד QR", details: qr.message }, 502);
  } catch (error) {
    console.error("greenapi-session failed", error);
    return json({ error: "שגיאה בחיבור ל-Green API" }, 500);
  }
});
