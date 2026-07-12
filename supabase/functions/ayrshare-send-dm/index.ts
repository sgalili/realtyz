// Send a Facebook Messenger / Instagram DM through Ayrshare's Messages API.
// Called by send-message (for the /inbox composer) and any other outbound path.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";
import { AYR_BASE, resolveWorkspaceProfileKey } from "../_shared/ayrshare-helpers.ts";
import { circuitOpenResponse, readCircuit, tripOnAyrshareFailure } from "../_shared/ayrshare-circuit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const Body = z.object({
  lead_id: z.string().uuid(),
  content: z.string().min(1).max(4000),
  platform: z.enum(["messenger", "facebook", "instagram", "linkedin"]).default("messenger"),
  recipient_id: z.string().optional(), // PSID override
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { lead_id, content, platform } = parsed.data;
    const ayrPlatform = platform === "instagram" ? "instagram"
      : platform === "linkedin" ? "linkedin"
      : "facebook";

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const AYRSHARE_API_KEY = Deno.env.get("AYRSHARE_API_KEY");
    if (!AYRSHARE_API_KEY) {
      return new Response(JSON.stringify({ error: "AYRSHARE_API_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE);
    const circuit = await readCircuit(admin);
    if (circuit) return circuitOpenResponse(circuit, corsHeaders);

    const { profileKey } = await resolveWorkspaceProfileKey(admin);
    if (!profileKey) {
      return new Response(JSON.stringify({ error: "no_workspace_profile" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve recipient id from lead if not provided.
    let recipientId = parsed.data.recipient_id?.trim() || "";
    if (!recipientId) {
      const { data: lead } = await admin
        .from("leads")
        .select("messenger_psid, messenger_id, instagram_psid, instagram_handle, preferences")
        .eq("id", lead_id)
        .maybeSingle();
      const prefs = ((lead as any)?.preferences && typeof (lead as any).preferences === "object")
        ? (lead as any).preferences
        : {};
      if (ayrPlatform === "instagram") {
        recipientId = (lead as any)?.instagram_psid || prefs.instagram_psid || prefs.instagram_user_id || "";
      } else if (ayrPlatform === "linkedin") {
        recipientId = prefs.linkedin_urn || prefs.linkedin_id || "";
      } else {
        recipientId = (lead as any)?.messenger_psid || prefs.messenger_psid || prefs.facebook_user_id || (lead as any)?.messenger_id || "";
      }
    }
    if (!recipientId) {
      return new Response(JSON.stringify({
        error: "no_recipient_psid",
        details: ayrPlatform === "linkedin"
          ? "Cannot send a LinkedIn DM until this lead has messaged you first (LinkedIn requires a member URN captured from an inbound message)."
          : "Cannot send a Messenger DM until this lead has messaged your Page at least once (Facebook requires a PSID and a 24-hour messaging window).",
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ayrshare Messages send endpoint: POST /api/messages/:platform
    // with { recipientId, message }.
    const payload = {
      recipientId,
      message: content,
    };

    const r = await fetch(`${AYR_BASE}/messages/${ayrPlatform}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AYRSHARE_API_KEY}`,
        "Content-Type": "application/json",
        "Profile-Key": profileKey,
      },
      body: JSON.stringify(payload),
    });
    const raw = await r.text();
    let json: any = null;
    try { json = raw ? JSON.parse(raw) : null; } catch { /* keep raw */ }

    if (!r.ok) {
      await tripOnAyrshareFailure(admin, r.status, json ?? { raw }, `messages:${ayrPlatform}`);
      console.error("[ayrshare-send-dm] provider rejected", { status: r.status, raw: raw.slice(0, 500) });
      return new Response(JSON.stringify({
        error: json?.message || `ayrshare_${r.status}`,
        code: json?.code || null,
        raw: json ?? raw,
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Persist the outbound message so it shows up in /inbox.
    const { error: insErr } = await admin.from("messages").insert({
      lead_id,
      content,
      direction: "outbound",
      sender_type: "supervisor",
      channel: platform,
      platform,
      metadata: { ayrshare_response: json, recipient_id: recipientId },
    } as any);
    if (insErr) console.error("[ayrshare-send-dm] messages insert failed", insErr);

    return new Response(JSON.stringify({ ok: true, provider: json }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[ayrshare-send-dm]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
