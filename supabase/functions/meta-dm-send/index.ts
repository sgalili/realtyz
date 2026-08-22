// meta-dm-send — send a Facebook Messenger / Instagram DM through the official
// Meta Send API.
//
// POST { lead_id, content, platform?: messenger|facebook|instagram, recipient_id? }
//   → { ok: true, message_id }                       on success
//   → 422 { error: "no_recipient_psid", details }     when the lead never wrote us
//   → 200 { ok: false, error }                        on a Graph rejection
import { corsHeaders } from "../_shared/cors.ts";
import { z } from "https://esm.sh/zod@3.25.76";
import { metaAdminClient, resolveMetaPage, resolveTenant } from "../_shared/metaPage.ts";
import { dmText, normalizeDmPlatform, psidColumn, sendDm } from "../_shared/metaDm.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.object({
  lead_id: z.string().uuid(),
  content: z.string().min(1).max(4000),
  platform: z.enum(["messenger", "facebook", "instagram"]).default("messenger"),
  recipient_id: z.string().max(200).optional(),
  user_id: z.string().uuid().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(raw);
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { lead_id, content } = parsed.data;
    const platform = normalizeDmPlatform(parsed.data.platform);

    const admin = metaAdminClient();
    const { ownerId } = await resolveTenant(admin, req, raw);
    if (!ownerId) return json({ error: "unauthorized" }, 401);

    const page = await resolveMetaPage(admin, ownerId);
    if (!page) {
      return json({
        ok: false,
        error: "page_not_connected",
        details: "עמוד הפייסבוק לא מחובר. חבר אותו בעמוד החיבורים כדי לשלוח הודעות ישירות.",
      }, 200);
    }

    // Resolve the recipient PSID / IGSID from the lead record.
    let recipientId = parsed.data.recipient_id?.trim() ?? "";
    if (!recipientId) {
      const { data: lead } = await admin
        .from("leads")
        .select("messenger_psid, messenger_id, instagram_psid, preferences")
        .eq("id", lead_id)
        .maybeSingle();
      const prefs = ((lead as any)?.preferences && typeof (lead as any).preferences === "object")
        ? (lead as any).preferences
        : {};
      recipientId = platform === "instagram"
        ? String((lead as any)?.instagram_psid || prefs.instagram_psid || prefs.instagram_user_id || "")
        : String((lead as any)?.messenger_psid || prefs.messenger_psid || prefs.facebook_user_id || (lead as any)?.messenger_id || "");
      recipientId = recipientId.trim();
    }
    if (!recipientId) {
      return json({
        error: "no_recipient_psid",
        code: "no_recipient_psid",
        details: platform === "instagram"
          ? "לא ניתן לשלוח הודעה באינסטגרם עד שהמתעניין ישלח הודעה ראשונה לחשבון (מטא מחייבת מזהה שיחה וחלון של 24 שעות)."
          : "לא ניתן לשלוח הודעה במסנג'ר עד שהמתעניין ישלח הודעה ראשונה לעמוד (מטא מחייבת PSID וחלון של 24 שעות).",
      }, 422);
    }

    const result = await sendDm(page, platform, recipientId, dmText(content));
    if (!result.ok) {
      console.error("[meta-dm-send] graph rejected", result.status, JSON.stringify(result.payload).slice(0, 500));
      return json({
        ok: false,
        success: false,
        error: result.error,
        code: result.payload?.error?.code ?? null,
        raw: result.payload,
      }, 200);
    }

    // Persist the outbound message so /inbox shows it immediately.
    const { error: insErr } = await admin.from("messages").insert({
      lead_id,
      content: dmText(content),
      direction: "outbound",
      sender_type: "supervisor",
      channel: platform,
      platform,
      metadata: {
        meta_message_id: result.messageId,
        recipient_id: recipientId,
        page_id: page.pageId,
        source: "meta-dm-send",
      },
    } as any);
    if (insErr) console.error("[meta-dm-send] messages insert failed", insErr.message);

    return json({ ok: true, success: true, message_id: result.messageId, provider: result.payload });
  } catch (e) {
    console.error("[meta-dm-send]", e);
    return json({ ok: false, error: String(e) }, 500);
  }
});
