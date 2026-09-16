/**
 * sms-inbound-webhook
 * ───────────────────
 * PUBLIC endpoint (no JWT) for INBOUND SMS replies delivered by the 019 gateway.
 *
 * Flow, per inbound SMS:
 *   1. Resolve the receiving workspace from the 019 sender/DID that was replied
 *      to (workspace_sms_settings.sender_id) — never a global guess.
 *   2. Resolve the CRM contact by phone (every IL phone format variant), or
 *      CREATE a new contact card immediately when the number is unknown.
 *   3. Store the inbound SMS in public.messages (platform/channel = 'sms') so
 *      the whole conversation shows in /inbox on the contact's chat window.
 *   4. Trigger Rita on the same SMS channel. The WhatsApp handoff is offered
 *      once, only after the client has sent at least two inbound SMS messages.
 *   5. Every outbound SMS is stored too, so the thread is complete.
 *
 * Optional shared-secret protection: SMS_INBOUND_WEBHOOK_SECRET, sent either as
 * the `x-webhook-secret` header or a `?secret=` query parameter (019's webhook
 * form only allows a URL).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "./cors.ts";
import { sendSms019, toLocalIL } from "./sms019.ts";
import { logIntegrationError } from "./logIntegrationError.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("SMS_INBOUND_WEBHOOK_SECRET") ?? "";

/** HARD RULE: only the official Meta WhatsApp Business number may be offered. */
const OFFICIAL_WABA_PHONE = "972537983832";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const firstString = (...vals: unknown[]): string => {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
};

/** Every shape an IL phone can be stored in, so a thread is never split. */
function phoneVariants(raw: string): string[] {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return [];
  const local = digits.startsWith("972") ? `0${digits.slice(3)}` : digits;
  const intl = digits.startsWith("0") ? `972${digits.slice(1)}` : digits;
  return Array.from(new Set([raw, digits, `+${digits}`, local, intl, `+${intl}`].filter(Boolean)));
}

/** Normalized storage form used across the CRM: 9725XXXXXXXX. */
function normalizeIl(raw: string): string | null {
  const local = toLocalIL(raw);
  return local ? `972${local.slice(1)}` : null;
}

/** CRM display form: 05X-XXXXXXX. */
function displayIL(raw: string): string {
  const local = toLocalIL(raw);
  if (!local) return String(raw ?? "");
  return `${local.slice(0, 3)}-${local.slice(3)}`;
}

/** Branded short link (https://realtyz.co.il/r/<slug>) for an SMS-safe URL. */
async function shortenLink(admin: any, longUrl: string, createdBy: string | null): Promise<string> {
  const alpha = "abcdefghijkmnpqrstuvwxyz23456789";
  for (let attempt = 0; attempt < 5; attempt++) {
    const buf = new Uint8Array(7);
    crypto.getRandomValues(buf);
    let slug = "";
    for (const b of buf) slug += alpha[b % alpha.length];
    const { error } = await admin
      .from("short_urls")
      .insert({ slug, property_id: null, long_url: longUrl, created_by: createdBy });
    if (!error) return `https://realtyz.co.il/r/${slug}`;
  }
  // Never block the reply on the shortener.
  return longUrl;
}

function extractXml(raw: string, tag: string): string {
  return raw.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"))?.[1]?.trim() ?? "";
}

export async function handleSmsInbound(req: Request, endpointName = "sms-inbound-webhook"): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);

  // 019's console verifies a webhook URL with a plain GET.
  if (req.method === "GET") return json({ ok: true, endpoint: endpointName });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  if (WEBHOOK_SECRET) {
    const provided = req.headers.get("x-webhook-secret") ?? url.searchParams.get("secret") ?? "";
    if (provided !== WEBHOOK_SECRET) return json({ error: "unauthorized" }, 401);
  }

  // ── Payload: 019 posts JSON, form-encoded or XML depending on the account ──
  let payload: Record<string, unknown> = {};
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  let rawBody = "";
  try {
    if (ct.includes("application/json")) {
      payload = (await req.json()) ?? {};
    } else if (ct.includes("form-urlencoded") || ct.includes("multipart/form-data")) {
      payload = Object.fromEntries([...(await req.formData()).entries()]) as Record<string, unknown>;
    } else {
      rawBody = await req.text();
      try {
        payload = JSON.parse(rawBody);
      } catch {
        payload = {
          phone: extractXml(rawBody, "phone") || extractXml(rawBody, "source") ||
            extractXml(rawBody, "from"),
          message: extractXml(rawBody, "message") || extractXml(rawBody, "text"),
          destination: extractXml(rawBody, "destination") || extractXml(rawBody, "target"),
          message_id: extractXml(rawBody, "message_id") || extractXml(rawBody, "id"),
        };
      }
    }
  } catch {
    return json({ error: "invalid_payload" }, 400);
  }
  // Some accounts deliver everything on the query string instead of a body.
  for (const [k, v] of url.searchParams.entries()) {
    if (payload[k] === undefined && k !== "secret") payload[k] = v;
  }

  const p = payload as Record<string, any>;
  const fromPhoneRaw = firstString(
    p.phone, p.from, p.From, p.source, p.sender, p.msisdn, p.originator, p.caller,
    p?.data?.phone, p?.data?.from,
  );
  const toPhoneRaw = firstString(
    p.destination, p.to, p.To, p.target, p.did, p.recipient, p.sender_id, p?.data?.to,
  );
  const bodyText = firstString(
    p.message, p.text, p.Body, p.body, p.content, p.sms, p?.data?.message, p?.data?.text,
  ).slice(0, 4000);
  const providerMessageId = firstString(p.message_id, p.messageId, p.id, p.sms_id);

  const fromNormalized = normalizeIl(fromPhoneRaw);
  if (!fromNormalized) {
    console.warn("[sms-inbound] unusable sender", { keys: Object.keys(p) });
    return json({ ok: true, skipped: "missing_or_invalid_sender", payload_keys: Object.keys(p) }, 202);
  }
  if (!bodyText) {
    return json({ ok: true, skipped: "empty_body", from_last4: fromNormalized.slice(-4) }, 202);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── 1. Which workspace owns the 019 number that was replied to? ───────────
  let workspaceOwnerId: string | null = null;
  const toLocal = toLocalIL(toPhoneRaw);
  if (toLocal) {
    try {
      const { data } = await admin
        .from("workspace_sms_settings")
        .select("workspace_owner_id, sender_id")
        .in("sender_id", phoneVariants(toLocal))
        .limit(1)
        .maybeSingle();
      workspaceOwnerId = (data as any)?.workspace_owner_id ?? null;
    } catch (e) {
      console.warn("[sms-inbound] sender→workspace lookup soft-fail", e instanceof Error ? e.message : e);
    }
  }

  // ── 2. Existing CRM contact for this phone (workspace-scoped when known) ──
  const LEAD_COLS =
    "id, full_name, phone_number, assigned_to, workspace_owner_id, ai_autopilot, deal_type, preferences";
  let lead: any = null;
  try {
    let q = admin.from("leads").select(LEAD_COLS).in("phone_number", phoneVariants(fromNormalized));
    if (workspaceOwnerId) q = q.eq("workspace_owner_id", workspaceOwnerId);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    // A failed lookup must be loud: silently treating it as "new number" would
    // duplicate the contact and split the thread.
    if (error) console.error("[sms-inbound] lead lookup failed", error.message);
    lead = data ?? null;
  } catch (e) {
    console.warn("[sms-inbound] lead lookup soft-fail", e instanceof Error ? e.message : e);
  }
  // No workspace resolved from the DID: fall back to the thread that already
  // exists for this phone anywhere, so replies never land in a stranger's inbox
  // silently — the contact's own workspace keeps owning the conversation.
  if (!lead?.id && !workspaceOwnerId) {
    try {
      const { data } = await admin
        .from("leads")
        .select(LEAD_COLS)
        .in("phone_number", phoneVariants(fromNormalized))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lead = data ?? null;
    } catch { /* soft-fail */ }
  }
  if (lead?.id && !workspaceOwnerId) {
    workspaceOwnerId = lead.workspace_owner_id ?? lead.assigned_to ?? null;
  }

  // ── 3. Brand-new number → create the CRM card immediately ────────────────
  let createdLead = false;
  if (!lead?.id) {
    if (!workspaceOwnerId) {
      // Last resort so an inbound SMS is never dropped: the platform admin.
      try {
        const { data: adminRow } = await admin
          .from("user_roles").select("user_id").eq("role", "super_admin").limit(1).maybeSingle();
        workspaceOwnerId = (adminRow as any)?.user_id ?? null;
      } catch { /* soft-fail */ }
    }
    if (!workspaceOwnerId) {
      console.error("[sms-inbound] no workspace could be resolved — cannot create a contact");
      return json({ ok: true, skipped: "no_workspace_resolved" }, 202);
    }
    try {
      const { data: created, error } = await admin
        .from("leads")
        .insert({
          phone_number: fromNormalized,
          // The phone is all we know yet — use it as the display name so Rita
          // never addresses the contact by a placeholder word.
          full_name: displayIL(fromNormalized),
          lead_stage: "engaging",
          status: "contacted",
          sentiment: "neutral",
          loyalty_tier: "Hot Lead",
          ai_autopilot: true,
          assigned_to: workspaceOwnerId,
          workspace_owner_id: workspaceOwnerId,
          is_demo: false,
          preferences: {
            source: "sms",
            channel: "sms",
            inbound_excerpt: bodyText.slice(0, 240),
            created_by_webhook: "sms-inbound-webhook",
          },
        })
        .select(LEAD_COLS)
        .maybeSingle();
      if (error) throw new Error(error.message);
      lead = created;
      createdLead = true;
      console.log("[sms-inbound] created new CRM contact", { lead_id: lead?.id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[sms-inbound] contact creation failed", msg);
      await logIntegrationError({
        integration: "sms",
        functionName: "sms-inbound-webhook",
        errorMessage: `failed to create a CRM contact for an inbound SMS: ${msg}`,
        context: { from_last4: fromNormalized.slice(-4) },
      });
      return json({ error: "lead_create_failed", detail: msg }, 500);
    }
  }

  // ── 4. Store the inbound SMS in the inbox (idempotent per provider id) ───
  // HARD RULE: this leg runs before (and independently of) every AI switch, and
  // falls back to a direct insert so a broken RPC can never lose a message.
  let duplicate = false;
  let inboundStored = false;
  const inboundMetadata = {
    provider: "019 SMS",
    external_id: providerMessageId || null,
    sender_phone: fromNormalized,
    did: toLocal ?? null,
    source: "sms-inbound-webhook",
  };
  try {
    if (providerMessageId) {
      const { data: dup } = await admin
        .from("messages")
        .select("id")
        .eq("lead_id", lead.id)
        .eq("metadata->>external_id", providerMessageId)
        .limit(1)
        .maybeSingle();
      duplicate = !!(dup as any)?.id;
    }
    if (!duplicate) {
      const { error: rpcErr } = await admin.rpc("record_interaction_message", {
        _lead_id: lead.id,
        _platform: "sms",
        _direction: "inbound",
        _sender_type: "voter",
        _content: bodyText,
        _external_id: providerMessageId || `sms-in:${crypto.randomUUID()}`,
        _created_at: new Date().toISOString(),
        _metadata: inboundMetadata,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      inboundStored = true;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sms-inbound] inbound store via RPC failed", msg);
    // Fallback: plain insert, so the conversation always shows in /inbox.
    try {
      const { error: insErr } = await admin.from("messages").insert({
        lead_id: lead.id,
        platform: "sms",
        channel: "sms",
        direction: "inbound",
        sender_type: "voter",
        content: bodyText,
        metadata: inboundMetadata,
      });
      if (insErr) throw new Error(insErr.message);
      inboundStored = true;
    } catch (e2) {
      const msg2 = e2 instanceof Error ? e2.message : String(e2);
      console.error("[sms-inbound] inbound direct insert failed", msg2);
      await logIntegrationError({
        integration: "sms",
        functionName: "sms-inbound-webhook",
        errorMessage: `failed to store an inbound SMS: ${msg} | ${msg2}`,
        context: { lead_id: lead.id },
      });
      return json({ error: "message_store_failed" }, 500);
    }
  }

  if (!duplicate && !inboundStored) return json({ error: "message_store_failed" }, 500);

  // In-app notification for the inbound SMS itself (independent of Rita).
  if (inboundStored && workspaceOwnerId) {
    try {
      await admin.from("notifications").insert({
        user_id: workspaceOwnerId,
        lead_id: lead.id,
        event_type: "inbound_sms",
        title: `הודעת SMS חדשה מ${lead.full_name ?? displayIL(fromNormalized)}`,
        body: bodyText.slice(0, 300),
        deep_link: `/inbox?chat=${lead.id}`,
        channel: "in_app",
        delivered: true,
      });
    } catch (e) {
      console.warn("[sms-inbound] inbound notification soft-fail", e instanceof Error ? e.message : e);
    }
  }

  try {
    await admin.from("leads").update({ last_interaction_at: new Date().toISOString() }).eq("id", lead.id);
  } catch { /* soft-fail */ }
  try {
    await admin.from("chat_history").insert({ lead_id: lead.id, role: "user", content: bodyText, is_demo: false });
  } catch { /* soft-fail */ }

  if (duplicate) {
    return json({ ok: true, lead_id: lead.id, stored: false, reason: "duplicate_provider_message" });
  }

  // ── 5. Rita ──────────────────────────────────────────────────────────────
  // NOTE: the inbound message is ALREADY stored above. Nothing in this block
  // may ever affect inbox logging — the AI switches only decide whether an
  // automated REPLY goes out.
  // Runs as a BACKGROUND task: the AI leg can take a minute, and 019 re-posts
  // the same SMS when the webhook does not answer quickly.
  const runRita = async () => {
  if (lead.ai_autopilot === false) {
    console.log("[sms-inbound] contact autopilot is off — no auto reply", { lead_id: lead.id });
    return;
  }
  try {
    if (!workspaceOwnerId) {
      console.log("[sms-inbound] no workspace owner — no auto reply", { lead_id: lead.id });
      return;
    }
    // The UI writes to TWO places: the inbox autopilot switch →
    // platform_settings.enable_ai_autopilot, and the sentiment switches →
    // profiles.auto_reply_positive / auto_reply_negative. Read both, and treat
    // a MISSING platform_settings row as "not configured" instead of "off".
    const [settingsRes, profileRes] = await Promise.all([
      admin
        .from("platform_settings")
        .select("enable_ai_autopilot, ai_paused")
        .eq("user_id", workspaceOwnerId)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("auto_reply_positive, auto_reply_negative")
        .eq("id", workspaceOwnerId)
        .maybeSingle(),
    ]);
    const settings = (settingsRes.data ?? null) as any;
    const profile = (profileRes.data ?? null) as any;
    const autopilotFlag = settings?.enable_ai_autopilot;
    const sentimentOn = profile?.auto_reply_positive === true || profile?.auto_reply_negative === true;
    const autoEnabled = autopilotFlag === false
      ? false
      : autopilotFlag === true || sentimentOn || lead.ai_autopilot !== false;
    if (!autoEnabled) {
      console.log("[sms-inbound] workspace Auto AI is off — no auto reply", {
        lead_id: lead.id,
        enable_ai_autopilot: autopilotFlag ?? null,
        sentiment_flags: sentimentOn,
      });
      return;
    }
    const { data: paused } = await admin.rpc("is_ai_paused", { _user_id: workspaceOwnerId });
    if (paused === true) {
      console.log("[sms-inbound] AI is paused for this workspace — no auto reply", { lead_id: lead.id });
      return;
    }
  } catch { /* soft-fail: never block the reply on the gate lookup */ }


  // How many replies has the CLIENT sent on this thread, and did Rita already
  // offer the WhatsApp switch? The switch is offered only from the 2nd reply on.
  let clientReplies = 1;
  let handoffOffered = false;
  try {
    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", lead.id)
      .eq("direction", "inbound");
    if (typeof count === "number" && count > 0) clientReplies = count;
  } catch { /* soft-fail */ }
  try {
    const { data: prior } = await admin
      .from("messages")
      .select("id")
      .eq("lead_id", lead.id)
      .eq("direction", "outbound")
      .eq("metadata->>whatsapp_handoff", "true")
      .limit(1)
      .maybeSingle();
    handoffOffered = !!(prior as any)?.id;
  } catch { /* soft-fail */ }

  const offerHandoff = clientReplies >= 2 && !handoffOffered;

  let reply = "";
  {
    // Rita always answers through the normal pipeline on the SMS channel.
    const rawName = String(lead.full_name ?? "").trim();
    const realName = rawName && /[A-Za-z\u0590-\u05FF]/.test(rawName) ? rawName : null;
    let history: Array<{ role: string; content: string }> = [];
    try {
      const { data: rows } = await admin
        .from("messages")
        .select("content, direction, created_at")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(20);
      history = ((rows ?? []) as any[])
        .reverse()
        .map((m) => ({ role: m.direction === "inbound" ? "user" : "assistant", content: String(m.content ?? "") }))
        .filter((m) => m.content);
    } catch { /* soft-fail: Rita can answer on the inbound text alone */ }

    try {
      const aiRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
        body: JSON.stringify({
          lead_id: lead.id,
          // A phone-shaped name means we do not know the real name yet — never
          // let Rita greet the contact by their own phone number.
          lead_name: realName || undefined,
          mode: "deal_room_reply",
          workspace_owner_id: workspaceOwnerId || undefined,
          context:
            `Inbound SMS from ${realName ?? "the contact (name unknown — do not invent one)"}: ${bodyText}\n` +
            `[CHANNEL: SMS] Keep the reply short (under 300 characters), plain text, no markdown and no emojis. ` +
            `Never mention WhatsApp and never include any link — the system appends the WhatsApp invitation itself when it is due.`,
          messages: history,
        }),
      });
      const rawAi = await aiRes.text();
      let aiJson: any = {};
      try { aiJson = JSON.parse(rawAi); } catch { /* non-json */ }
      if (!aiRes.ok) {
        console.error(`[sms-inbound] ai-agent failed ${aiRes.status}`, rawAi.slice(0, 400));
        await logIntegrationError({
          integration: "ai_gateway",
          functionName: "sms-inbound-webhook",
          errorCode: aiRes.status,
          errorMessage: `ai-agent failed for an inbound SMS (${aiRes.status})`,
          context: { lead_id: lead.id, response: rawAi.slice(0, 800) },
        });
      } else {
        const text = aiJson?.content ?? aiJson?.message ?? aiJson?.reply ?? "";
        reply = String(typeof text === "string" ? text : "").trim();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[sms-inbound] ai-agent threw", msg);
      await logIntegrationError({
        integration: "ai_gateway",
        functionName: "sms-inbound-webhook",
        errorMessage: `ai-agent call threw for an inbound SMS: ${msg}`,
        context: { lead_id: lead.id },
      });
    }

    if (!reply) {
      reply = `קיבלנו את ההודעה שלך ונחזור אליך עם תשובה מדויקת.`;
    }
  }

  // ── WhatsApp handoff: only from the client's 2nd reply onwards ────────────
  if (offerHandoff) {
    let waPhone = OFFICIAL_WABA_PHONE;
    try {
      const { data: prov } = await admin
        .from("wa_providers").select("config").eq("is_official", true).eq("is_active", true)
        .limit(1).maybeSingle();
      const cfg = ((prov as any)?.config ?? {}) as Record<string, unknown>;
      const digits = String(cfg.display_phone_number ?? cfg.phone_number ?? "").replace(/\D/g, "");
      if (digits.length >= 9) waPhone = digits;
    } catch { /* keep the official constant */ }

    const contextName = String(lead.full_name ?? "").trim();
    const prefill =
      `היי, זה ${contextName && !/^\d|^0\d/.test(contextName) ? contextName : "אני"} ` +
      `בהמשך להתכתבות ב-SMS: ${bodyText.slice(0, 160)}`;
    const waLink = `https://wa.me/${waPhone}?text=${encodeURIComponent(prefill)}`;
    const shortLink = await shortenLink(admin, waLink, workspaceOwnerId);
    reply = `${reply}\nנוח יותר להמשיך בוואטסאפ: ${shortLink}`;
  }

  // SMS is one segment-priced channel: keep the reply short.
  if (reply.length > 640) reply = `${reply.slice(0, 637)}...`;

  const sent = await sendSms019(admin, fromNormalized, reply, workspaceOwnerId);
  if (!sent.ok) {
    console.error("[sms-inbound] outbound SMS failed", sent.error);
    await logIntegrationError({
      integration: "sms",
      functionName: "sms-inbound-webhook",
      errorMessage: `Rita's SMS reply could not be sent: ${sent.error}`,
      context: { lead_id: lead.id, scope: sent.scope ?? null },
    });
  }

  // Store the outbound leg either way, marked with its delivery status, so the
  // inbox shows the full conversation and a failure is visible.
  try {
    await admin.rpc("record_interaction_message", {
      _lead_id: lead.id,
      _platform: "sms",
      _direction: "outbound",
      _sender_type: "ai",
      _content: reply,
      _external_id: sent.message_id || `sms-out:${crypto.randomUUID()}`,
      _created_at: new Date().toISOString(),
      _metadata: {
        provider: "019 SMS",
        message_id: sent.message_id ?? null,
        status: sent.ok ? "sent" : "failed",
        error: sent.ok ? null : sent.error ?? null,
        ai_assisted: true,
        whatsapp_handoff: offerHandoff ? "true" : "false",
        client_replies: clientReplies,
        source: "sms-inbound-webhook",
      },
    });
  } catch (e) {
    console.warn("[sms-inbound] outbound store soft-fail", e instanceof Error ? e.message : e);
  }
  try {
    await admin.from("chat_history").insert({ lead_id: lead.id, role: "assistant", content: reply, is_demo: false });
  } catch { /* soft-fail */ }

  // Create an in-app notification for the workspace that owns this SMS thread.
  // The notification points to the exact stored reply and is never shared with
  // another workspace.
  if (workspaceOwnerId) {
    try {
      await admin.from("notifications").insert({
        user_id: workspaceOwnerId,
        lead_id: lead.id,
        event_type: "rita_sms_reply",
        title: "ריטה השיבה ב-SMS",
        body: reply,
        deep_link: `/inbox?chat=${lead.id}`,
        channel: "in_app",
        delivered: true,
        delivery_result: {
          message_id: sent.message_id ?? null,
          sms_status: sent.ok ? "sent" : "failed",
          source: "sms-019-webhook",
        },
      });
    } catch (e) {
      console.warn("[sms-inbound] Rita notification soft-fail", e instanceof Error ? e.message : e);
    }
  }

  console.log("[sms-inbound] Rita replied", {
    lead_id: lead.id,
    replied: sent.ok,
    client_replies: clientReplies,
    whatsapp_handoff: offerHandoff,
  });
  };

  const task = runRita().catch((e) =>
    console.error("[sms-inbound] Rita task failed", e instanceof Error ? e.message : e)
  );
  const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil;
  if (typeof waitUntil === "function") waitUntil(task);
  else await task;

  return json({
    ok: true,
    lead_id: lead.id,
    lead_created: createdLead,
    stored: true,
    rita: "queued",
  });
}
