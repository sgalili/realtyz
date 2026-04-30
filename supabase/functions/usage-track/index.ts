// Usage tracking: logs a send event, enforces budget caps, returns allowed/remaining.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SERVICE = z.enum(["sms", "whatsapp", "ai_voice", "meta_ads", "ai_touchpoints", "email"]);

const Body = z.object({
  service_type: SERVICE,
  units: z.number().positive().default(1),
  unit_cost: z.number().nonnegative().default(0),
  metadata: z.record(z.any()).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { service_type, units, unit_cost, metadata } = parsed.data;
    const total_cost = Number((units * unit_cost).toFixed(4));
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Check budget cap
    const { data: limit } = await admin
      .from("budget_limits")
      .select("monthly_limit, hard_stop")
      .eq("user_id", user.id)
      .eq("service_type", service_type)
      .maybeSingle();

    let mtdSpend = 0;
    if (limit && limit.monthly_limit > 0) {
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const { data: sumRows } = await admin
        .from("usage_events")
        .select("total_cost")
        .eq("user_id", user.id)
        .eq("service_type", service_type)
        .gte("created_at", monthStart.toISOString());
      mtdSpend = (sumRows ?? []).reduce((s, r) => s + Number(r.total_cost || 0), 0);

      if (limit.hard_stop && mtdSpend + total_cost > limit.monthly_limit) {
        return new Response(JSON.stringify({
          allowed: false,
          reason: "budget_cap",
          mtd_spend: mtdSpend,
          monthly_limit: limit.monthly_limit,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const { error: insErr } = await admin.from("usage_events").insert({
      user_id: user.id,
      service_type,
      units,
      unit_cost,
      total_cost,
      metadata: metadata ?? {},
    });
    if (insErr) throw insErr;

    return new Response(JSON.stringify({
      allowed: true,
      mtd_spend: mtdSpend + total_cost,
      monthly_limit: limit?.monthly_limit ?? null,
      remaining: limit?.monthly_limit ? Math.max(0, Number(limit.monthly_limit) - (mtdSpend + total_cost)) : null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("usage-track error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
