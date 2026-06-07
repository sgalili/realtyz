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

interface Body {
  lead_ids?: string[];
  force?: boolean;
  limit?: number;
}

function normalizeChatId(phone: string): string | null {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  // Israeli local numbers (e.g. 05XXXXXXXX) -> 9725XXXXXXXX
  if (digits.startsWith("0")) digits = "972" + digits.slice(1);
  if (digits.length < 8) return null;
  return `${digits}@c.us`;
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
      return new Response(
        JSON.stringify({ error: "Green API not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const [instanceId, ...tokParts] = String(cfg.api_key).split(":");
    const token = tokParts.join(":");
    if (!instanceId || !token) {
      return new Response(
        JSON.stringify({ error: "Invalid Green API api_key format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
      scanned: leads?.length ?? 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [] as string[],
    };

    if (!leads?.length) {
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const endpoint =
      `https://api.green-api.com/waInstance${instanceId}/getAvatar/${token}`;

    // Sequential with small delay — Green API rate-limits aggressive bursts.
    for (const lead of leads) {
      const chatId = normalizeChatId(lead.phone_number as string);
      if (!chatId) {
        results.skipped++;
        continue;
      }
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId }),
        });
        const json = await res.json().catch(() => ({} as any));
        const url: string | null =
          json?.urlAvatar && typeof json.urlAvatar === "string" && json.urlAvatar.trim().length > 0
            ? json.urlAvatar.trim()
            : null;

        if (!res.ok) {
          results.failed++;
          if (results.errors.length < 5) {
            results.errors.push(`${lead.phone_number}: HTTP ${res.status}`);
          }
        } else if (url) {
          const { error: upErr } = await supabase
            .from("leads")
            .update({ profile_picture_url: url })
            .eq("id", lead.id);
          if (upErr) {
            results.failed++;
            if (results.errors.length < 5) results.errors.push(upErr.message);
          } else {
            results.updated++;
          }
        } else {
          // No avatar set on this WA account.
          results.skipped++;
        }
      } catch (e: any) {
        results.failed++;
        if (results.errors.length < 5) results.errors.push(String(e?.message ?? e));
      }
      // Gentle pacing — Green API personal-tier ~5 req/s.
      await new Promise((r) => setTimeout(r, 220));
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
