// Rita autopilot for Messenger / Instagram DMs — mirrors the SMS/WhatsApp leg:
// workspace gates → property focus → direct fact answer or ai-agent → repeat
// guard → send on the SAME channel → store outbound.
import { logIntegrationError } from "./logIntegrationError.ts";
import { renderFocusPropertyBlock } from "./focusProperty.ts";
import { answerPropertyFact, isRepeatReply, readRitaState, renderRitaStateBlock, resolveFocusListing, saveRitaState } from "./ritaIntel.ts";
import { generateFastReply } from "./waFastReply.ts";
import { type InboundDm, resolveDmLead, sendDm } from "./metaDm.ts";
import type { MetaPage } from "./metaPage.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

async function autopilotAllowed(admin: any, ownerId: string, lead: any): Promise<boolean> {
  try {
    const [settingsRes, profileRes] = await Promise.all([
      admin.from("platform_settings").select("enable_ai_autopilot").eq("user_id", ownerId).maybeSingle(),
      admin.from("profiles").select("auto_reply_positive, auto_reply_negative").eq("id", ownerId).maybeSingle(),
    ]);
    const flag = (settingsRes.data as any)?.enable_ai_autopilot;
    const p = (profileRes.data as any) ?? {};
    const sentimentOn = p.auto_reply_positive === true || p.auto_reply_negative === true;
    const on = flag === false ? false : flag === true || sentimentOn || lead.ai_autopilot !== false;
    if (!on) return false;
    const { data: paused } = await admin.rpc("is_ai_paused", { _user_id: ownerId });
    return paused !== true;
  } catch {
    return true;
  }
}

export async function runRitaForDm(admin: any, ownerId: string, page: MetaPage, dm: InboundDm): Promise<void> {
  const leadId = await resolveDmLead(admin, ownerId, dm);
  if (!leadId) return;
  const { data: lead } = await admin
    .from("leads")
    .select("id, full_name, ai_autopilot, interest_tag, preferences")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return;
  if (!(await autopilotAllowed(admin, ownerId, lead))) {
    console.log("[metaDmRita] autopilot off/paused", { lead_id: leadId });
    return;
  }

  let history: Array<{ role: string; content: string }> = [];
  try {
    const { data: rows } = await admin
      .from("messages")
      .select("content, direction, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(20);
    history = ((rows ?? []) as any[]).reverse()
      .map((m) => ({ role: m.direction === "inbound" ? "user" : "assistant", content: String(m.content ?? "") }))
      .filter((m) => m.content);
  } catch { /* answer on the inbound text alone */ }

  const channelLabel = dm.platform === "instagram" ? "Instagram" : "Messenger";
  const rawName = String(lead.full_name ?? "").trim();
  const realName = rawName && !/^(Messenger|Instagram) \w{6}$/.test(rawName) ? rawName : null;
  const focusRow = await resolveFocusListing(admin, ownerId, dm.text, history, lead.interest_tag ?? null);
  const focusBlock = renderFocusPropertyBlock(focusRow as any);
  const stateBlock = renderRitaStateBlock(readRitaState(lead.preferences));
  const factAnswer = answerPropertyFact(dm.text, focusRow as any);
  let reply = factAnswer ?? "";

  if (!reply) {
    try {
      const aiRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
        body: JSON.stringify({
          lead_id: leadId,
          lead_name: realName || undefined,
          mode: "deal_room_reply",
          workspace_owner_id: ownerId,
          context:
            `Inbound ${channelLabel} message from ${realName ?? "the contact (name unknown — do not invent one)"}: ${dm.text}\n` +
            `[CHANNEL: ${channelLabel}] Reply on this same channel. Short, natural, plain text, no markdown.` +
            (focusBlock ? `\n[FOCUS_PROPERTY] The contact is asking about THIS property. Never ask which property. Answer from these facts:\n${focusBlock}` : "") +
            stateBlock,
          messages: history,
        }),
      });
      const raw = await aiRes.text();
      let json: any = {};
      try { json = JSON.parse(raw); } catch { /* non-json */ }
      if (!aiRes.ok) {
        await logIntegrationError({
          integration: "ai_gateway",
          functionName: "meta-dm-webhook",
          errorCode: aiRes.status,
          errorMessage: `ai-agent failed for an inbound ${channelLabel} message (${aiRes.status})`,
          context: { lead_id: leadId, response: raw.slice(0, 800) },
        });
        // 402/403 are terminal — do not fall back to another model call.
        if (aiRes.status === 402 || aiRes.status === 403) return;
      } else {
        const t = json?.content ?? json?.message ?? json?.reply ?? "";
        reply = String(typeof t === "string" ? t : "").trim();
      }
    } catch (e) {
      await logIntegrationError({
        integration: "ai_gateway",
        functionName: "meta-dm-webhook",
        errorMessage: `ai-agent call threw for ${channelLabel}: ${e instanceof Error ? e.message : String(e)}`,
        context: { lead_id: leadId },
      });
    }
  }

  if (!reply || (!factAnswer && isRepeatReply(reply, history))) {
    const fresh = await generateFastReply({
      lead: { id: leadId, full_name: realName, preferences: lead.preferences ?? null },
      inboundText: dm.text,
      history,
      contextBlock: `[CHANNEL: ${channelLabel}] תשובה קצרה וטבעית.${stateBlock}`,
      focusProperty: focusBlock || null,
    } as any).catch(() => ({ text: "" }));
    if ((fresh as any)?.text) reply = (fresh as any).text;
  }
  if (!reply) return; // stay silent rather than send a canned line
  void saveRitaState(admin, leadId, lead.preferences, dm.text, reply);

  const sent = await sendDm(page, dm.platform, dm.senderId, reply);
  if (!sent.ok) {
    await logIntegrationError({
      integration: "meta",
      functionName: "meta-dm-webhook",
      errorMessage: `Rita's ${channelLabel} reply could not be sent: ${sent.error}`,
      context: { lead_id: leadId },
    });
  }
  await admin.from("messages").insert({
    lead_id: leadId,
    content: reply,
    direction: "outbound",
    sender_type: "ai",
    channel: dm.platform,
    platform: dm.platform,
    metadata: {
      meta_message_id: sent.ok ? sent.messageId : null,
      status: sent.ok ? "sent" : "failed",
      error: sent.ok ? null : sent.error,
      ai_assisted: true,
      source: "meta-dm-webhook",
    },
  } as any);
}
