// Public Client Portal endpoint.
// GET ?token=... → returns sanitized lead + matched listings + agent contact + branding,
// and logs a portal view (increments view_count, writes interaction_activity_log row).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const STAGE_LABELS: Record<string, string> = {
  new_lead: "פנייה חדשה",
  listing_outreach: "הצגת נכסים",
  qualified: "התעניינות פעילה",
  meeting: "תיאום פגישה",
  negotiation: "משא ומתן",
  awaiting_signature: "ממתין לחתימה",
  closed: "סגור",
  lost: "לא רלוונטי",
};

function maskPhoneForDisplay(p?: string | null) {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  if (digits.length < 9) return p;
  // 9725XXXXXXXX → 05X-XXXXXXX
  if (digits.startsWith("972")) {
    const local = "0" + digits.slice(3);
    return `${local.slice(0, 3)}-${local.slice(3)}`;
  }
  return p;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token")?.trim();
    if (!token || token.length < 16) {
      return json({ error: "Invalid token" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    // 1) Look up the link
    const { data: link, error: linkErr } = await admin
      .from("client_portal_links")
      .select("id, lead_id, user_id, expires_at, revoked_at")
      .eq("token", token)
      .maybeSingle();

    if (linkErr) throw linkErr;
    if (!link) return json({ error: "Link not found" }, 404);
    if (link.revoked_at) return json({ error: "Link revoked" }, 410);
    if (new Date(link.expires_at) < new Date()) {
      return json({ error: "Link expired" }, 410);
    }

    // 2) Lead (sanitized)
    const { data: lead, error: leadErr } = await admin
      .from("leads")
      .select(
        "id, full_name, city, neighborhood, deal_type, lead_stage, preferences, interest_tag",
      )
      .eq("id", link.lead_id)
      .maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) return json({ error: "Lead missing" }, 404);

    // 3) Agent / branding
    const { data: agent } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", link.user_id)
      .maybeSingle();

    const { data: agentRoleRow } = await admin
      .from("api_configs")
      .select("api_key, service_name")
      .in("service_name", ["whatsapp_agent_phone"])
      .maybeSingle();

    const { data: branding } = await admin
      .from("white_label_settings")
      .select("agency_name, logo_url, primary_color")
      .eq("user_id", link.user_id)
      .maybeSingle();

    // 4) Listings the agent has actively shared / extracted for this lead
    const { data: outreach } = await admin
      .from("interaction_activity_log")
      .select("metadata, created_at")
      .eq("user_id", link.user_id)
      .eq("thread_key", `lead:${lead.id}`)
      .eq("action_type", "listing_share")
      .order("created_at", { ascending: false })
      .limit(20);

    const sharedListingIds = Array.from(
      new Set(
        (outreach ?? [])
          .map((r: any) => r?.metadata?.listing_id)
          .filter(Boolean),
      ),
    );

    let listings: any[] = [];
    if (sharedListingIds.length) {
      const { data: ls } = await admin
        .from("listings")
        .select(
          "id, property_title, description, asking_price, city, neighborhood, address, rooms, sqm, floor, parking, elevator, slug, features",
        )
        .in("id", sharedListingIds);
      listings = ls ?? [];
    }

    // 5) Log the view
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ua = req.headers.get("user-agent") ?? null;
    const referrer = req.headers.get("referer") ?? null;

    await admin.from("client_portal_views").insert({
      link_id: link.id,
      ip_address: ip,
      user_agent: ua,
      referrer,
    });

    await admin
      .from("client_portal_links")
      .update({
        last_viewed_at: new Date().toISOString(),
        view_count: undefined as any, // increment via rpc-less workaround below
      })
      .eq("id", link.id);
    // increment view_count safely
    await admin.rpc as any; // noop placeholder; actual increment via direct sql:
    await admin
      .from("client_portal_links")
      .update({ view_count: (await getCount(admin, link.id)) + 1 })
      .eq("id", link.id);

    // 6) Activity log on the lead — so the agent sees the visit in the timeline
    await admin.from("interaction_activity_log").insert({
      user_id: link.user_id,
      thread_key: `lead:${lead.id}`,
      action_type: "client_portal_view",
      platform: "portal",
      actor_type: "client",
      actor_label: lead.full_name ?? "Client",
      content: "הלקוח צפה בפורטל השיתוף",
      metadata: { link_id: link.id, ip, user_agent: ua, referrer },
    });

    // Refresh last_interaction_at on the lead so the broker can react.
    await admin
      .from("leads")
      .update({ last_interaction_at: new Date().toISOString() })
      .eq("id", lead.id);

    const agentPhone =
      (agentRoleRow as any)?.api_key ??
      Deno.env.get("AGENT_WHATSAPP_PHONE") ??
      null;

    return json({
      ok: true,
      lead: {
        id: lead.id,
        full_name: lead.full_name,
        city: lead.city,
        neighborhood: lead.neighborhood,
        deal_type: lead.deal_type,
        stage_key: lead.lead_stage,
        stage_label:
          STAGE_LABELS[lead.lead_stage ?? ""] ?? lead.lead_stage ?? "—",
        preferences: lead.preferences ?? {},
      },
      listings,
      agent: {
        name: agent?.full_name ?? branding?.agency_name ?? "הסוכן שלך",
        email: agent?.email ?? null,
        whatsapp_phone: agentPhone,
        whatsapp_phone_display: maskPhoneForDisplay(agentPhone),
      },
      branding: {
        agency_name: branding?.agency_name ?? null,
        logo_url: branding?.logo_url ?? null,
        primary_color: branding?.primary_color ?? null,
      },
    });
  } catch (e: any) {
    console.error("client-portal error", e);
    return json({ error: e?.message ?? "Internal error" }, 500);
  }
});

async function getCount(admin: any, id: string): Promise<number> {
  const { data } = await admin
    .from("client_portal_links")
    .select("view_count")
    .eq("id", id)
    .maybeSingle();
  return Number(data?.view_count ?? 0);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
