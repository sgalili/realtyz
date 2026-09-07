// kb-gemini-studio
// ────────────────
// Free-form Gemini workspace over the caller's knowledge base.
// Pulls: KB documents (titles + text), the agent persona, and active workspace
// behaviour rules, then answers/produces content grounded in all of it.
//
// Input:  { prompt: string, mode?: 'answer' | 'document' }
// Output: { content: string, sources: string[], title: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const prompt = String(body?.prompt ?? "").trim().slice(0, 6000);
    const mode = body?.mode === "document" ? "document" : "answer";
    if (!prompt) return json({ error: "prompt required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Workspace context ──────────────────────────────────────────────
    const [docsRes, personaRes, rulesRes] = await Promise.all([
      admin
        .from("knowledge_documents")
        .select("title, source_type, raw_text, created_at")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(60),
      admin.from("agent_personas").select("*").eq("user_id", user.id).maybeSingle(),
      admin
        .from("system_intelligence_kb")
        .select("rule_text, category")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(60),
    ]);

    const docs = (docsRes.data ?? []) as Array<{ title: string; source_type: string | null; raw_text: string | null }>;
    const sources = docs.map((d) => d.title).filter(Boolean);

    // Keep the prompt bounded: newest documents first, ~1200 chars each.
    let budget = 90_000;
    const docBlocks: string[] = [];
    for (const d of docs) {
      const text = (d.raw_text ?? "").trim();
      if (!text) continue;
      const slice = text.slice(0, 1200);
      if (budget - slice.length < 0) break;
      budget -= slice.length;
      docBlocks.push(`[${d.source_type ?? "doc"}] ${d.title}\n${slice}`);
    }

    const persona = personaRes.data as Record<string, unknown> | null;
    const personaBlock = persona
      ? [
          persona.tone ? `טון: ${persona.tone}${persona.tone_custom ? ` (${persona.tone_custom})` : ""}` : "",
          persona.professional_bio ? `ביוגרפיה מקצועית: ${persona.professional_bio}` : "",
          persona.selling_philosophy ? `פילוסופיית מכירה: ${persona.selling_philosophy}` : "",
          persona.signature ? `חתימה: ${persona.signature}` : "",
          persona.style_calibration ? `כיול סגנון: ${JSON.stringify(persona.style_calibration).slice(0, 2000)}` : "",
        ].filter(Boolean).join("\n")
      : "";

    const rules = (rulesRes.data ?? []) as Array<{ rule_text: string; category: string | null }>;
    const rulesBlock = rules.map((r) => `- ${r.category ? `[${r.category}] ` : ""}${r.rule_text}`).join("\n");

    const systemPrompt = [
      "אתה Gemini במרחב העבודה של Realtyz AI. אתה חוקר, מנתח ומייצר תוכן על בסיס מאגר הידע של המשתמש:",
      "מסמכים, פרסונת הסוכן, תבניות פוסטים, הנחיות כתיבה ומענה וכללי תקשורת.",
      "כשמידע נמצא במאגר - הסתמך עליו והצג אותו במדויק. כשחסר מידע - אמור זאת במשפט אחד והצע מה להוסיף למאגר.",
      "אסור להמציא נכסים, לקוחות, מחירים או עסקאות שלא במאגר.",
      "כתוב בעברית תכליתית, בלי מקפים ארוכים (— –), בלי כוכביות Markdown.",
      mode === "document"
        ? "פורמט: הפק מסמך מוכן לשמירה במאגר הידע. שורה ראשונה: 'כותרת: <כותרת קצרה>'. אחריה גוף המסמך בפסקאות/סעיפים מסודרים."
        : "פורמט: תשובה קצרה וממוקדת, ואם מתאים סעיפים קצרים.",
      "",
      personaBlock ? `פרסונת הסוכן:\n${personaBlock}` : "",
      rulesBlock ? `כללי מערכת פעילים:\n${rulesBlock}` : "",
      docBlocks.length ? `מאגר הידע (${docBlocks.length} מסמכים):\n\n${docBlocks.join("\n\n---\n\n")}` : "מאגר הידע ריק.",
    ].filter(Boolean).join("\n");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (aiResp.status === 429) return json({ error: "יותר מדי בקשות, נסה שוב בעוד רגע." }, 429);
    if (aiResp.status === 402) return json({ error: "נדרשים קרדיטים ל-Lovable AI." }, 402);
    if (!aiResp.ok) {
      console.error("kb-gemini-studio gateway error", aiResp.status, await aiResp.text());
      return json({ error: "שגיאה בשירות ה-AI" }, 502);
    }

    const data = await aiResp.json();
    let content = String(data?.choices?.[0]?.message?.content ?? "").trim();
    let title = "";
    const m = content.match(/^\s*כותרת:\s*(.+)/);
    if (m) {
      title = m[1].trim();
      content = content.replace(/^\s*כותרת:\s*.+\n?/, "").trim();
    }

    return json({ content, title, sources, used_documents: docBlocks.length });
  } catch (e) {
    console.error("kb-gemini-studio error", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
