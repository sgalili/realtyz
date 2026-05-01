import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  slug: z.string().min(1).max(120),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) })).min(1).max(30),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: page, error: pageError } = await admin
      .from("listings")
      .select("user_id, candidate_name, headline, thesis, pillars")
      .eq("slug", parsed.data.slug)
      .eq("is_published", true)
      .maybeSingle();
    if (pageError) throw pageError;
    if (!page) {
      return new Response(JSON.stringify({ error: "candidate page not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lastQuestion = [...parsed.data.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    let kbContext = "(לא נמצאו מסמכי ידע רלוונטיים)";
    try {
      const embRes = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/text-embedding-004", input: lastQuestion }),
      });
      if (embRes.ok) {
        const embedding = (await embRes.json())?.data?.[0]?.embedding;
        if (Array.isArray(embedding)) {
          const { data: matches } = await admin.rpc("match_knowledge_chunks", {
            query_embedding: embedding,
            match_user_id: page.user_id,
            match_count: 5,
          });
          if (matches?.length) {
            kbContext = matches.map((m: any, i: number) => `[${i + 1}] ${m.document_title}\n${m.content}`).join("\n\n---\n\n");
          }
        }
      }
    } catch (e) {
      console.warn("public KB lookup failed", e);
    }

    const system = `אתה צ׳אטבוט ציבורי של עמוד מתעניין ב-Realtyz. ענה בעברית, ב-RTL, בקצרה ובאמינות. אל תמציא עובדות. אם אין מידע במאגר הידע, אמור זאת והצע לפנות לסוכן.\n\nמתעניין: ${page.candidate_name}\nכותרת: ${page.headline}\nתזה: ${page.thesis}\nעמודי תווך: ${JSON.stringify(page.pillars)}\n\nמאגר ידע רלוונטי:\n${kbContext}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: system }, ...parsed.data.messages],
      }),
    });
    if (!aiRes.ok) throw new Error(`AI error ${aiRes.status}`);
    const answer = (await aiRes.json())?.choices?.[0]?.message?.content ?? "אין לי תשובה כרגע.";

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});