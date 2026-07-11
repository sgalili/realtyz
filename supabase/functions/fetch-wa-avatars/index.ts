// Fetch WhatsApp profile pictures for leads via Green API and
// persist the URL to public.leads.profile_picture_url so the CRM
// (VoterAvatar, Deal Room, Inbox sidebar, Live Conversations,
// Campaign Center, etc.) renders a real photo instead of the
// generic line-art fallback.
//
// POST body (all optional):
//   { lead_ids?: string[], force?: boolean, limit?: number }
// - lead_ids omitted  -> processes leads missing profile_picture_url
//                        (or all leads when force=true), up to `limit`.
// - force=true        -> refetch even if a URL already exists.
// - limit             -> default 500, hard cap 2000.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Body {
  lead_ids?: string[];
  force?: boolean;
  limit?: number;
}

function normalizeChatId(phone: string): string | null {
  if (!phone) return null;
  // Strip every non-digit (spaces, dashes, parens, +): "054-681-1841" -> "0546811841"
  let digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  // Israeli local "0XXXXXXXXX"            -> "972XXXXXXXXX"
  if (digits.startsWith("0")) digits = "972" + digits.slice(1);
  // Bare Israeli mobile "5XXXXXXXX" (9 digits, no leading 0) -> "9725XXXXXXXX"
  else if (digits.length === 9 && digits.startsWith("5")) digits = "972" + digits;
  if (digits.length < 10) return null;
  return `${digits}@c.us`;
}

async function readProviderError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  if (!text) return `Green API returned HTTP ${res.status}`;
  try {
    const j = JSON.parse(text);
    const message = j?.message || j?.error || j?.description || j?.reason;
    return message ? String(message) : text.slice(0, 240);
  } catch {
    return text.slice(0, 240);
  }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body: Body = await req.json().catch(() => ({}));
    const force = !!body.force;
    const limit = Math.min(Math.max(body.limit ?? 500, 1), 2000);

    // Load Green API creds.
    const { data: cfg } = await supabase
      .from("api_configs")
      .select("api_key, is_active")
      .eq("service_name", "Green API")
      .maybeSingle();

    if (!cfg?.api_key || cfg.is_active === false) {
      return json({ success: false, error: "green_api_not_configured", reason: "Green API לא מוגדר או לא פעיל בהגדרות" });
    }
    const [instanceId, ...tokParts] = String(cfg.api_key).split(":");
    const token = tokParts.join(":");
    if (!instanceId || !token) {
      return json({ success: false, error: "green_api_invalid_config", reason: "פורמט החיבור ל-Green API לא תקין. נדרש Instance ID:Token" });
    }

    // Resolve target leads.
    let query = supabase
      .from("leads")
      .select("id, phone_number, profile_picture_url")
      .not("phone_number", "is", null)
      .limit(limit);

    if (Array.isArray(body.lead_ids) && body.lead_ids.length > 0) {
      query = query.in("id", body.lead_ids);
    } else if (!force) {
      query = query.or("profile_picture_url.is.null,profile_picture_url.eq.");
    }

    const { data: leads, error: leadsErr } = await query;
    if (leadsErr) throw leadsErr;

    const results = {
      success: true,
      scanned: leads?.length ?? 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [] as string[],
      reasons: [] as string[],
      results: [] as Array<{ lead_id: string; phone?: string | null; status: string; reason?: string; url?: string }>,
    };

    if (!leads?.length) {
      return json({ ...results, reason: "לא נמצאו אנשי קשר עם מספר טלפון לשליפה" });
    }

    const avatarEndpoint =
      `https://api.green-api.com/waInstance${instanceId}/getAvatar/${token}`;
    const contactInfoEndpoint =
      `https://api.green-api.com/waInstance${instanceId}/getContactInfo/${token}`;

    async function resolveAvatarUrl(chatId: string): Promise<{ url: string | null; reason?: string }> {
      // 1) primary: getAvatar
      try {
        const res = await fetch(avatarEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId }),
        });
        if (res.ok) {
          const j = await res.json().catch(() => ({} as any));
          const u = typeof j?.urlAvatar === "string" ? j.urlAvatar.trim() : "";
          if (u) return { url: u };
          if (j?.available === false) {
            return { url: null, reason: "הגדרות הפרטיות ב-WhatsApp לא מאפשרות לראות את תמונת הפרופיל" };
          }
          if (j?.available === true) {
            return { url: null, reason: "למספר אין תמונת פרופיל ב-WhatsApp או שהמספר אינו חשבון WhatsApp פעיל" };
          }
        } else if (res.status !== 404) {
          return { url: null, reason: `Green API getAvatar נכשל: ${await readProviderError(res)}` };
        }
      } catch (e) {
        return { url: null, reason: `Green API getAvatar נכשל: ${(e as Error).message}` };
      }
      // 2) fallback: getContactInfo (returns avatar field for known contacts)
      try {
        const res2 = await fetch(contactInfoEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId }),
        });
        if (res2.ok) {
          const j = await res2.json().catch(() => ({} as any));
          const u = typeof j?.avatar === "string" ? j.avatar.trim() : "";
          if (u) return { url: u };
        } else if (res2.status !== 404) {
          return { url: null, reason: `Green API getContactInfo נכשל: ${await readProviderError(res2)}` };
        }
      } catch (e) {
        return { url: null, reason: `Green API getContactInfo נכשל: ${(e as Error).message}` };
      }
      return { url: null, reason: "לא נמצאה תמונת פרופיל זמינה ב-WhatsApp עבור המספר הזה" };
    }

    // Sequential with small delay — Green API rate-limits aggressive bursts.
    for (const lead of leads) {
      const chatId = normalizeChatId(lead.phone_number as string);
      if (!chatId) {
        results.skipped++;
        const reason = "מספר הטלפון לא תקין לשליפת WhatsApp";
        if (results.reasons.length < 5) results.reasons.push(reason);
        results.results.push({ lead_id: lead.id as string, phone: lead.phone_number as string, status: "skipped", reason });
        continue;
      }
      try {
        const { url, reason } = await resolveAvatarUrl(chatId);
        if (url) {
          const { error: upErr } = await supabase
            .from("leads")
            .update({ profile_picture_url: url })
            .eq("id", lead.id);
          if (upErr) {
            results.failed++;
            if (results.errors.length < 5) results.errors.push(upErr.message);
            if (results.reasons.length < 5) results.reasons.push(upErr.message);
            results.results.push({ lead_id: lead.id as string, phone: lead.phone_number as string, status: "failed", reason: upErr.message });
          } else {
            results.updated++;
            results.results.push({ lead_id: lead.id as string, phone: lead.phone_number as string, status: "updated", url });
          }
        } else if (reason?.startsWith("Green API")) {
          results.failed++;
          const line = `${lead.phone_number}: ${reason}`;
          if (results.errors.length < 5) results.errors.push(line);
          if (results.reasons.length < 5) results.reasons.push(reason);
          results.results.push({ lead_id: lead.id as string, phone: lead.phone_number as string, status: "failed", reason });
        } else {
          results.skipped++;
          const safeReason = reason || "לא נמצאה תמונת פרופיל זמינה ב-WhatsApp";
          if (results.reasons.length < 5) results.reasons.push(safeReason);
          results.results.push({ lead_id: lead.id as string, phone: lead.phone_number as string, status: "skipped", reason: safeReason });
        }
      } catch (e: any) {
        results.failed++;
        const reason = String(e?.message ?? e);
        if (results.errors.length < 5) results.errors.push(reason);
        if (results.reasons.length < 5) results.reasons.push(reason);
        results.results.push({ lead_id: lead.id as string, phone: lead.phone_number as string, status: "failed", reason });
      }
      // Gentle pacing — Green API personal-tier ~5 req/s.
      await new Promise((r) => setTimeout(r, 220));
    }


    return json({
      ...results,
      success: results.updated > 0 || results.failed === 0,
      reason: results.updated > 0 ? undefined : results.reasons[0] || results.errors[0] || "לא נמצאה תמונת פרופיל זמינה ב-WhatsApp",
    });
  } catch (e: any) {
    return json({ success: false, error: "fetch_wa_avatar_failed", reason: String(e?.message ?? e) });
  }
});
