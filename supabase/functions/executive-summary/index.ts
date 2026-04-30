import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    let mapboxToken = Deno.env.get("MAPBOX_ACCESS_TOKEN") ?? "";

    const sb = createClient(supabaseUrl, serviceKey);

    // Try to read Mapbox token from api_configs table
    const { data: mapboxConfig } = await sb
      .from("api_configs")
      .select("api_key")
      .eq("service_name", "Mapbox")
      .eq("is_active", true)
      .maybeSingle();
    if (mapboxConfig?.api_key) mapboxToken = mapboxConfig.api_key;

    // Gather stats in parallel
    const [
      { count: totalVoters },
      { count: supporters },
      { data: cityData },
      { data: sentimentData },
      { data: settingsData },
      { data: recentGrowth },
    ] = await Promise.all([
      sb.from("leads").select("*", { count: "exact", head: true }),
      sb.from("leads").select("*", { count: "exact", head: true }).in("status", ["supporter", "active", "voted"]),
      sb.from("leads").select("city, sentiment"),
      sb.from("leads").select("sentiment"),
      sb.from("campaign_settings").select("key, value"),
      sb.from("leads").select("created_at, city").gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
    ]);

    const settings = Object.fromEntries((settingsData ?? []).map((r: any) => [r.key, r.value]));
    const votesPerMandate = 30000;
    const legacyThreshold = parseInt(settings.winning_threshold || "60000", 10);
    const mandateTarget = Math.max(1, parseInt(settings.mandate_target || String(Math.round(legacyThreshold / votesPerMandate)), 10));
    const targetVotes = mandateTarget * votesPerMandate;

    // Build city clusters for map
    const cityMap = new Map<string, { count: number; positive: number; negative: number; neutral: number }>();
    (cityData ?? []).forEach((v: any) => {
      const city = v.city || "לא ידוע";
      const entry = cityMap.get(city) || { count: 0, positive: 0, negative: 0, neutral: 0 };
      entry.count++;
      if (v.sentiment === "positive") entry.positive++;
      else if (v.sentiment === "negative") entry.negative++;
      else entry.neutral++;
      cityMap.set(city, entry);
    });

    const cityClusters = Array.from(cityMap.entries())
      .map(([city, stats]) => ({ city, ...stats }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    // Sentiment breakdown
    const sentimentBreakdown = { positive: 0, negative: 0, neutral: 0 };
    (sentimentData ?? []).forEach((v: any) => {
      if (v.sentiment === "positive") sentimentBreakdown.positive++;
      else if (v.sentiment === "negative") sentimentBreakdown.negative++;
      else sentimentBreakdown.neutral++;
    });

    // AI narrative
    const statsContext = `
Campaign stats:
- Total registered voters: ${totalVoters ?? 0}
- Confirmed supporters (supporter/active/voted): ${supporters ?? 0}
- Mandate target: ${mandateTarget} mandates
- Target votes: ${targetVotes}
- Progress: ${Math.round(((supporters ?? 0) / targetVotes) * 100)}%
- Sentiment: ${sentimentBreakdown.positive} positive, ${sentimentBreakdown.neutral} neutral, ${sentimentBreakdown.negative} negative
- New voters this week: ${recentGrowth?.length ?? 0}
- Top cities: ${cityClusters.slice(0, 5).map(c => `${c.city}(${c.count})`).join(", ")}
`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "You are the Kalpiz Intelligence Officer. Write exactly 2 sentences in Hebrew summarizing the campaign status. Be specific with numbers and trends. Sound confident and strategic.",
          },
          { role: "user", content: statsContext },
        ],
      }),
    });

    let narrative = "לא ניתן לייצר סיכום כרגע.";
    if (aiRes.ok) {
      const aiJson = await aiRes.json();
      narrative = aiJson.choices?.[0]?.message?.content ?? narrative;
    }

    return new Response(
      JSON.stringify({
        totalVoters: totalVoters ?? 0,
        supporters: supporters ?? 0,
        mandateTarget,
        targetVotes,
        sentimentBreakdown,
        cityClusters,
        narrative,
        mapboxToken,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("executive-summary error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
