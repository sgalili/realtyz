// Spin a Facebook-group-tailored variant of an existing post body.
//
// Request:  { body: string, group_name?: string, group_url?: string, seed?: string|number }
// Returns:  { draft: string }
//
// The model is asked to rewrite the BODY only (above the canonical broker
// footer) into a fresh phrasing that fits the spirit of the target FB group
// without inventing facts or street numbers. Compliance footer is reapplied
// client-side via ensureCanonicalFooter() so this endpoint stays focused.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Strip the canonical broker footer (phone line + byline + license) so we
// rewrite only the marketing copy and reattach the footer on the client.
function stripCanonicalFooter(text: string): string {
  return String(text ?? "")
    .replace(/\n*\s*לפרטים\s+נוספים[^]*?052[\s\-]?297[\s\-]?3500[^\n]*/gu, "")
    .replace(/\n*\s*אודי\s+ויטמן\s*-\s*אנגלו[^\n]*/gu, "")
    .replace(/\n*\s*ר\.?\s*מ\s*[:：][^\n]*/gu, "")
    .replace(/\n*\s*רישיון\s*תיווך\s*מספר\s*[:：][^\n]*/gu, "")
    .replace(/\s+$/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const { body, group_name, group_url, seed } = await req.json().catch(() => ({} as any));
    const source = stripCanonicalFooter(String(body ?? "").trim());
    if (!source) return json({ error: "body is required" }, 400);

    const systemPrompt = [
      "אתה כותב פוסטים לקבוצות פייסבוק עבור משרד תיווך נדל\"ן בישראל.",
      "המשימה: לנסח מחדש פוסט קיים כך שיישמע טבעי ושונה — אבל בלי להמציא עובדות חדשות, מספרי רחוב, מחירים או תכונות שלא הופיעו בטקסט המקור.",
      "כתוב בעברית RTL, טון אנושי, חם ותכליתי. השתמש באמוג'ים בעדינות (לא יותר מ-3).",
      "אסור: em-dash, en-dash, רצף --- או --, סלוגנים כלליים בסגנון AI, התחלה ב'גלו' או 'הזדמנות מדהימה', מילים כמו 'ליד'/'לידים'.",
      "החזר אך ורק את גוף הפוסט המנוסח מחדש — בלי כותרת, בלי הקדמה, בלי חתימה, בלי קישור. אורך דומה למקור (±20%).",
    ].join("\n");

    const userPrompt = [
      group_name ? `הפוסט מיועד לקבוצת הפייסבוק: ${group_name}` : null,
      group_url ? `(כתובת הקבוצה למידע בלבד, אל תכתוב אותה בפוסט: ${group_url})` : null,
      seed !== undefined ? `נסה זווית/פתיח שונה מהפעם הקודמת (seed=${seed}).` : null,
      "",
      "טקסט המקור:",
      "---",
      source,
      "---",
      "כתוב גרסה אלטרנטיבית אחת בלבד.",
    ].filter(Boolean).join("\n");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (aiRes.status === 429) return json({ error: "Rate limits exceeded, please try again later." }, 429);
    if (aiRes.status === 402) return json({ error: "Payment required, please add funds to your Lovable AI workspace." }, 402);
    if (!aiRes.ok) {
      console.warn("[spin-group-post] AI gateway error", aiRes.status);
      return json({ draft: source });
    }

    const payload = await aiRes.json();
    let draft: string =
      payload?.choices?.[0]?.message?.content?.trim() || source;

    // Sanitize forbidden dashes per house style.
    draft = draft
      .replace(/—|–/g, "-")
      .replace(/-{2,}/g, "-")
      .trim();

    return json({ draft });
  } catch (e) {
    console.error("[spin-group-post] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
