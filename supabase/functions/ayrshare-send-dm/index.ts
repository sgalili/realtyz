// Send a Facebook Messenger / Instagram DM through Ayrshare's Messages API.
// Called by send-message (for the /inbox composer) and any other outbound path.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";
import { AYR_BASE, resolveWorkspaceProfileKey } from "../_shared/ayrshare-helpers.ts";

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
    const ayrPlatform = platform === "instagram" ? "instagram" : "facebook";

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
    const { profileKey } = await resolveWorkspaceProfileKey(admin);
    if (!profileKey) {
      return new Response(JSON.stringify({ error: "no_workspace_profile" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve recipient PSID from lead if not provided.
    let recipientId = parsed.data.recipient_id?.trim() || "";
    if (!recipientId) {
      const { data: lead } = await admin
        .from("leads")
        .select("messenger_psid, instagram_psid, facebook_user_id")
        .eq("id", lead_id)
        .maybeSingle();
      recipientId = (ayrPlatform === "instagram"
        ? lead?.instagram_psid
        : lead?.messenger_psid || (lead as any)?.facebook_user_id) || "";
    }
    if (!recipientId) {
      return new Response(JSON.stringify({
        error: "no_recipient_psid",
        details: "Cannot send a Messenger DM until this lead has messaged your Page at least once (Facebook requires a PSID and a 24-hour messaging window).",
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ayrshare Messages send endpoint. Body shape follows their public docs:
    // POST /api/messages with { platform, id (recipient PSID), message }.
    const payload = {
      platform: ayrPlatform,
      id: recipientId,
      message: content,
    };

    const r = await fetch(`${AYR_BASE}/messages`, {
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
