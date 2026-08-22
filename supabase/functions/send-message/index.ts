import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toLocalIL(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("972")) d = `0${d.slice(3)}`;
  else if (d.startsWith("5") && d.length === 9) d = `0${d}`;
  return /^05\d{8}$/.test(d) ? d : null;
}

function toIntlIL(raw: string | null | undefined): string | null {
  const local = toLocalIL(raw);
  return local ? `972${local.slice(1)}` : null;
}

async function sendSms019(admin: ReturnType<typeof createClient>, phone: string, body: string) {
  const local = toLocalIL(phone);
  if (!local) return { ok: false, error: "מספר טלפון לא תקין" };
  const { data } = await admin
    .from("api_configs")
    .select("api_key")
    .eq("service_name", "019 SMS")
    .eq("is_active", true)
    .maybeSingle();
  const parts = String((data as any)?.api_key || "").split(":");
  const user = parts[0] || "";
  const password = parts[1] || "";
  const sender = (parts.slice(2).join(":") || "").trim();
  if (!user || !password) return { ok: false, error: "019 SMS לא מוגדר" };
  if (!sender) return { ok: false, error: "019 SMS: חסר שולח (Sender ID) מאושר. הזן בהגדרות API את השולח שרשום כ-SMS-capable בחשבון 019 שלך." };
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sms>
  <user><username>${escapeXml(user)}</username><password>${escapeXml(password)}</password></user>
  <source>${escapeXml(sender)}</source>
  <destinations><phone>${escapeXml(local)}</phone></destinations>
  <message>${escapeXml(body)}</message>
</sms>`;
  const res = await fetch("https://www.019sms.co.il:8090/api", {
    method: "POST",
    headers: { "Content-Type": "application/xml; charset=UTF-8" },
    body: xml,
  });
  const text = await res.text();
  const status = parseInt(text.match(/<status>(-?\d+)<\/status>/)?.[1] ?? "-1", 10);
  if (status === 0) return { ok: true, provider: "019 SMS", message_id: text.match(/<message_id>(.*?)<\/message_id>/)?.[1] ?? null };
  return { ok: false, error: text.match(/<message>(.*?)<\/message>/)?.[1] || `019 status ${status}` };
}

async function sendSmsTwilio(admin: ReturnType<typeof createClient>, phone: string, body: string) {
  const intl = toIntlIL(phone);
  if (!intl) return { ok: false, error: "מספר טלפון לא תקין" };
  const { data } = await admin
    .from("api_configs")
    .select("api_key")
    .eq("service_name", "Twilio")
    .eq("is_active", true)
    .maybeSingle();
  const parts = String((data as any)?.api_key || "").split(":");
  const accountSid = parts[0] || "";
  const authToken = parts[1] || "";
  const fromNumber = parts.slice(2).join(":") || "";
  if (!accountSid || !authToken || !fromNumber) return { ok: false, error: "Twilio לא מוגדר" };

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: `+${intl}`,
      From: fromNumber,
      Body: body,
    }),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep raw */ }
  if (res.ok) return { ok: true, provider: "Twilio", message_id: json?.sid ?? null };
  return { ok: false, error: json?.message || text || `Twilio status ${res.status}` };
}

async function sendSms(admin: ReturnType<typeof createClient>, phone: string, body: string) {
  const sms019 = await sendSms019(admin, phone, body);
  if (sms019.ok) return sms019;
  const twilio = await sendSmsTwilio(admin, phone, body);
  if (twilio.ok) return twilio;
  return { ok: false, error: `${sms019.error || "019 failed"}; ${twilio.error || "Twilio failed"}` };
}

const WebhookPayload = z.object({
  lead_id: z.string().uuid().optional(),
  content: z.string().min(1).max(5000),
  channel: z.string().default("whatsapp"),
  phone_number: z.string().optional(),
  attachment: z.unknown().optional(),
  invite_channel: z.string().optional(),
  drip: z.object({
    enabled: z.boolean().default(false),
    daily_limit: z.number().int().min(1).max(1000).default(50),
    send_window_start: z.string().default("08:00"),
    send_window_end: z.string().default("20:00"),
    stagger_min_minutes: z.number().int().min(1).max(120).default(7),
    stagger_max_minutes: z.number().int().min(1).max(240).default(23),
  }).optional(),
}).refine((v) => !!v.lead_id || !!v.phone_number, {
  message: "lead_id or phone_number is required",
});

async function buildInviteLink(
  supabase: ReturnType<typeof createClient>,
  channel: string,
): Promise<string | null> {
  // Look up the workspace's shared social profile to derive m.me / ig.me links.
  const { data: prof } = await supabase
    .from("workspace_social_profile")
    .select("facebook_page_id, facebook_page_name, connected_platforms")
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .maybeSingle();
  const p: any = prof || {};
  const pageId = p.facebook_page_id || p.facebook_page_name;
  const connected: any = p.connected_platforms || {};
  const getConnected = (name: string) => {
    if (connected && !Array.isArray(connected) && typeof connected === "object") return connected[name] || null;
    if (Array.isArray(connected)) {
      return connected.find((item: any) => {
        if (typeof item === "string") return item.toLowerCase() === name;
        return String(item?.platform || item?.name || "").toLowerCase() === name;
      }) || null;
    }
    return null;
  };
  const ig = getConnected("instagram") || {};
  const tg = getConnected("telegram") || {};
  const li = getConnected("linkedin") || {};
  const igUser = ig?.username || ig?.handle;
  const tgBot = tg?.bot_username || tg?.username || tg?.handle;
  const liUrl = li?.url || li?.profile_url || li?.profileUrl || li?.company_url || li?.companyUrl;
  const liUser = li?.username || li?.handle || li?.vanity_name || li?.vanityName;
  switch (channel) {
    case "messenger":
    case "facebook":
      return pageId ? `https://m.me/${pageId}` : null;
    case "instagram":
      return igUser ? `https://ig.me/m/${igUser}` : null;
    case "telegram":
      return tgBot ? `https://t.me/${tgBot}` : null;
    case "linkedin":
      return liUrl ? String(liUrl) : (liUser ? `https://www.linkedin.com/in/${liUser}` : null);
    default:
      return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const parsed = WebhookPayload.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { lead_id, content, channel, phone_number, attachment, drip, invite_channel } = parsed.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData.user) {
      return new Response(JSON.stringify({ error: "נדרש חיבור משתמש כדי לשלוח לאישור" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Channel credentials (WhatsApp Business, SMS, ...) belong to the WORKSPACE
    // OWNER, not to each team member. Resolve the active workspace owner so a
    // collaborator's send is routed through the owner's authorized Meta number.
    let workspaceOwnerId = userData.user.id;
    try {
      const { data: prof } = await admin
        .from("profiles")
        .select("active_workspace_owner_id")
        .eq("id", userData.user.id)
        .maybeSingle();
      const owner = (prof as any)?.active_workspace_owner_id;
      if (owner) workspaceOwnerId = owner as string;
    } catch (_e) { /* fall back to self */ }

    const { data: voter } = lead_id
      ? await supabase
        .from("leads")
        .select("phone_number, full_name")
        .eq("id", lead_id)
        .single()
      : { data: null } as any;

    // If this is an invite send, resolve the destination channel deep-link and
    // template {LINK} into the content.
    let finalContent = content;
    if (invite_channel && content.includes("{LINK}")) {
      const url = await buildInviteLink(admin, invite_channel);
      if (!url) {
        return new Response(JSON.stringify({ error: "invite_link_unavailable", details: "No invite link is configured for this channel" }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      finalContent = content.replace(/\{LINK\}/g, url || "");
    }

    // Invites must be delivered immediately over WA/SMS. Do not put them in the
    // human approval queue, otherwise the broker sees "queued" and the lead never
    // receives the link that opens Messenger/Instagram.
    if (invite_channel && (channel === "whatsapp" || channel === "sms")) {
      const destinationPhone = phone_number || voter?.phone_number || "";
      if (!destinationPhone) {
        return new Response(JSON.stringify({ error: "missing_phone_number" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (channel === "whatsapp") {
        const intl = toIntlIL(destinationPhone);
        if (!intl) {
          return new Response(JSON.stringify({ error: "invalid_phone_number" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const waRes = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ lead_id, phone_number: intl, message: finalContent, tenant_id: workspaceOwnerId }),
        });
        const waText = await waRes.text();
        let waJson: any = null; try { waJson = waText ? JSON.parse(waText) : null; } catch { /* keep */ }
        if (!waRes.ok || waJson?.success === false) {
          return new Response(JSON.stringify({ error: waJson?.error || "whatsapp_invite_failed", details: waJson || waText }), {
            status: waRes.ok ? 502 : waRes.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ success: true, sent: true, provider: waJson?.provider || "whatsapp" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const sms = await sendSms(admin, destinationPhone, finalContent);
      if (!sms.ok) {
        return new Response(JSON.stringify({ error: "sms_invite_failed", details: sms.error }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await admin.from("messages").insert({
        lead_id,
        content: finalContent,
        direction: "outbound",
        sender_type: "agent",
        channel: "sms",
        platform: "sms",
        metadata: { provider: sms.provider, message_id: sms.message_id, invite_channel },
      } as any);
      return new Response(JSON.stringify({ success: true, sent: true, provider: sms.provider }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Direct DM channels (Messenger / Instagram / raw Facebook DM) bypass the
    // approval queue: they send immediately through the official Meta Send API
    // and the outbound row is inserted by meta-dm-send.
    if (channel === "messenger" || channel === "instagram" || channel === "facebook") {
      if (!lead_id) {
        return new Response(JSON.stringify({ success: false, sent: false, fallback: true, error: "missing_lead_id", code: "missing_lead_id" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const dmRes = await fetch(`${supabaseUrl}/functions/v1/meta-dm-send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ lead_id, content: finalContent, platform: channel }),
      });
      const dmText = await dmRes.text();
      let dmJson: any = null; try { dmJson = dmText ? JSON.parse(dmText) : null; } catch { /* keep */ }
      if (!dmRes.ok) {
        const isNoPsid = dmJson?.error === "no_recipient_psid" || dmJson?.code === "no_recipient_psid";
        // Return 200 with a fallback flag so the client's invoke() doesn't
        // treat this as a runtime error (which surfaces as a blank-screen crash).
        return new Response(JSON.stringify({
          success: false,
          sent: false,
          fallback: isNoPsid,
          error: dmJson?.error || `dm_send_failed_${dmRes.status}`,
          code: isNoPsid ? "no_recipient_psid" : (dmJson?.code || null),
          details: dmJson?.details || dmJson?.raw || dmText,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ success: true, sent: true, provider: dmJson?.provider ?? null }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // WhatsApp from the inbox composer must be delivered NOW through the
    // official Meta WhatsApp Business API (send-whatsapp routes WBA/GreenAPI),
    // not parked in the human approval queue.
    if (channel === "whatsapp") {
      const destinationPhone = phone_number || voter?.phone_number || "";
      const intl = toIntlIL(destinationPhone) ?? (destinationPhone.replace(/\D/g, "") || null);
      if (!intl) {
        return new Response(JSON.stringify({ error: "אין מספר טלפון תקין לשליחה" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const waRes = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ lead_id, phone_number: intl, message: finalContent, tenant_id: workspaceOwnerId }),
      });
      const waText = await waRes.text();
      let waJson: any = null; try { waJson = waText ? JSON.parse(waText) : null; } catch { /* keep raw */ }
      if (!waRes.ok || waJson?.success === false) {
        // send-whatsapp already returns a short, human-readable Hebrew reason.
        // Never leak the raw provider payload to the UI.
        return new Response(JSON.stringify({
          error: waJson?.error || "שליחת ההודעה בוואטסאפ נכשלה — נסה שוב",
          code: (waJson?.details as any)?.code ?? null,
        }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        success: true,
        sent: true,
        provider: waJson?.provider || "WBA",
        message_id: waJson?.message_id ?? null,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // SMS from the inbox composer must be delivered now, not queued for human

    // approval. Try the configured SMS gateways and persist the outbound row.
    if (channel === "sms") {
      const destinationPhone = phone_number || voter?.phone_number || "";
      if (!destinationPhone) {
        return new Response(JSON.stringify({ error: "missing_phone_number" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const sms = await sendSms(admin, destinationPhone, finalContent);
      if (!sms.ok) {
        return new Response(JSON.stringify({ error: "sms_send_failed", details: sms.error }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await admin.from("messages").insert({
        lead_id,
        content: finalContent,
        direction: "outbound",
        sender_type: "agent",
        channel: "sms",
        platform: "sms",
        metadata: { provider: sms.provider, message_id: sms.message_id },
      } as any);
      return new Response(JSON.stringify({ success: true, sent: true, provider: sms.provider }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: approval, error: dbError } = await supabase
      .from("approval_queue")
      .insert({
        user_id: userData.user.id,
        content_type: "outbound_message",
        platform: channel,
        target_lead_id: lead_id,
        target_label: voter?.full_name || phone_number || voter?.phone_number || null,
        title: `הודעה ממתינה לאישור - ${voter?.full_name || channel}`,
        proposed_content: finalContent,
        confidence_score: 100,
        requires_human_review: true,
        source_citations: [],
        metadata: { phone_number: phone_number || voter?.phone_number, attachment, drip_feed: drip || { enabled: false }, invite_channel: invite_channel || null },
        created_by_ai: false,
      })
      .select()
      .single();

    if (dbError) {
      console.error("DB insert error:", dbError);
      return new Response(
        JSON.stringify({
          error: "Failed to queue message",
          code: (dbError as any).code,
          details: dbError.message,
          hint: (dbError as any).hint,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        queued: true,
        approval_id: approval.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
