// master-research
// Live web research for the Master Intelligence Officer ("קצין המודיעין").
// Uses Firecrawl (search + scrape) to gather sources for a neighborhood,
// property type, or open question, then synthesizes a structured Hebrew
// brief via Gemini. The final brief is auto-persisted into
// `system_intelligence_kb` so EVERY downstream generator (posts, replies,
// voice agent, WhatsApp companion) inherits the new intelligence on the
// next call via the existing fetchSystemRulesBlock injector.
//
// Body: { query: string, mode?: 'neighborhood'|'property'|'web',
//         workspace_owner_id?: string (service-mode only),
//         persist?: boolean (default true) }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

type SearchResult = { url: string; title?: string; description?: string; markdown?: string };

async function firecrawlSearch(query: string, limit = 10): Promise<SearchResult[]> {
  if (!FIRECRAWL_API_KEY) return [];
  try {
    const r = await fetch(`${FIRECRAWL_V2}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit,
        lang: "he",
        country: "il",
        scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
      }),
    });
    if (!r.ok) {
      console.warn("firecrawl search failed", r.status, await r.text().catch(() => ""));
      return [];
    }
    const j = await r.json();
    const items: any[] = j?.data?.web ?? j?.data ?? j?.web ?? [];
    return items
      .map((it: any) => ({
        url: it?.url ?? it?.link ?? "",
        title: it?.title ?? it?.metadata?.title ?? "",
        description: it?.description ?? it?.metadata?.description ?? "",
        markdown: it?.markdown ?? it?.content ?? "",
      }))
      .filter((x) => x.url);
  } catch (e) {
    console.warn("firecrawl search threw", e);
    return [];
  }
}

async function synthesizeBrief(query: string, mode: string, sources: SearchResult[]): Promise<string> {
  const sourcesBlock = sources
    .slice(0, 6)
    .map((s, i) => {
      const body = (s.markdown || s.description || "").slice(0, 2500);
      return `[#${i + 1}] ${s.title || s.url}\n${s.url}\n${body}`;
    })
    .join("\n\n---\n\n");

  const system = `אתה "קצין המודיעין" של Realtyz - אנליסט נדל"ן בכיר.
המשתמש (בעל המשרד) ביקש מחקר עבור: "${query}" (מצב: ${mode}).
בנה תקציר מודיעיני עברית, רהוט, ברור, ללא em-dash, ללא "--", ללא פתיחות AI גנריות.
חובה לעגן את כל הקביעות במקורות שלמטה. אם פיסת מידע לא נמצאת במקורות, ציין במפורש "לא נמצא במקורות הזמינים".

מבנה חובה (כותרות ##):
## תקציר מנהלים
שלוש-ארבע שורות חדות.
## סטטוס תכנון ובינוי
תב"ע, היתרים, צפי אכלוס, הגבלות רגולטוריות.
## חינוך וקהילה
בתי ספר, גני ילדים, פעילויות, פרופיל אוכלוסיה.
## תחבורה ונגישות
תחבורה ציבורית, כבישים, רכבות, פיתוח עתידי.
## מסחר ופנאי
מרכזי קניות, פארקים, מסעדות, מתקני פנאי.
## תמונת מחירים
טווחי מחירים, מחיר למ"ר, עסקאות אחרונות, השוואה לסביבה.
## מאפייני נכס מומלצים
חדרים, כיווני אוויר, קומה, חניה, מרפסת, מעלית - מה מניע ביקוש.
## קהל יעד אופטימלי
פילוח מפורט: רוכשים / שוכרים / משקיעי תשואה - גילאי, סוגי משפחה, פרופיל הכנסה.
## חמישה צעדים שיווקיים מומלצים
בדיוק 5 צעדים קונקרטיים, כל אחד 1-2 משפטים, ניתנים לביצוע השבוע.
## מקורות
רשימה ממוספרת [#n] כותרת + URL.

מקורות גולמיים:
${sourcesBlock || "(לא נמצאו מקורות חיים. תן את התקציר על סמך ידע כללי בלבד וציין זאת)"}`;

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0.4,
      max_tokens: 2200,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `בנה את התקציר המודיעיני עבור: ${query}` },
      ],
    }),
  });
  if (!r.ok) throw new Error(`AI synth failed: ${r.status} ${await r.text().catch(() => "")}`);
  const j = await r.json();
  return String(j?.choices?.[0]?.message?.content ?? "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({} as any));
    const query = String(body?.query ?? "").trim();
    const mode = String(body?.mode ?? "neighborhood");
    const persist = body?.persist !== false;
    if (!query) {
      return new Response(JSON.stringify({ error: "query required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve workspace from JWT (user) or explicit param (service).
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    let workspaceOwnerId: string | null = null;
    let actorUserId: string | null = null;
    if (jwt && jwt !== SERVICE_KEY) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });
      const { data: u } = await userClient.auth.getUser();
      actorUserId = u?.user?.id ?? null;
      if (actorUserId) {
        const { data: prof } = await userClient
          .from("profiles")
          .select("active_workspace_owner_id")
          .eq("id", actorUserId)
          .maybeSingle();
        workspaceOwnerId = (prof?.active_workspace_owner_id as string | undefined) || actorUserId;
      }
    } else {
      workspaceOwnerId = body?.workspace_owner_id ?? null;
    }

    // Live web research.
    const searchQuery = mode === "neighborhood"
      ? `${query} נדל"ן שכונה תב"ע בתי ספר תחבורה מחירים`
      : mode === "property"
        ? `${query} נדל"ן מחירים השוואה`
        : query;
    const sources = await firecrawlSearch(searchQuery, 6);

    // Synthesis (Hebrew structured brief).
    const brief = await synthesizeBrief(query, mode, sources);

    // Fire-and-forget persistence into the workspace's continuous-learning KB
    // so every future post / reply / voice script inherits this intel via
    // fetchSystemRulesBlock. Skipped when we have no workspace context.
    let persisted = false;
    if (persist && workspaceOwnerId) {
      try {
        const compact = brief.slice(0, 3800);
        fetch(`${SUPABASE_URL}/functions/v1/ingest-system-rule`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({
            text:
              `Apply this real-world neighborhood/property intelligence whenever drafting ANY content, ` +
              `reply, or voice script that mentions "${query}". Ground all factual claims in it; ` +
              `never invent prices, schools, or zoning details that contradict it.\n\n${compact}`,
            source: "research_insight",
            role: "owner",
            signal: "directive",
            workspace_owner_id: workspaceOwnerId,
            actor_user_id: actorUserId,
            metadata: { research_query: query, mode, source_count: sources.length },
          }),
        }).catch((e) => console.warn("ingest-system-rule fire-and-forget failed:", e));
        persisted = true;
      } catch (e) {
        console.warn("persistence dispatch failed:", e);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        query,
        mode,
        brief,
        sources: sources.map((s) => ({ url: s.url, title: s.title, description: s.description })),
        persisted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("master-research error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
