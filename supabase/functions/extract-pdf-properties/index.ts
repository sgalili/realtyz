// OCR-fallback PDF parser for property imports.
// Accepts a base64 PDF (data URL or raw base64) and asks Gemini to return a JSON
// table of rows. Used when pdfjs text extraction yields nothing (scanned PDFs).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { file_data_url, file_name } = await req.json();
    if (!file_data_url || typeof file_data_url !== "string") {
      return new Response(JSON.stringify({ error: "file_data_url required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dataUrl = file_data_url.startsWith("data:")
      ? file_data_url
      : `data:application/pdf;base64,${file_data_url}`;

    const prompt = `אתה מקבל קובץ PDF של רשימת נכסי נדל"ן (לרוב בעברית, יתכן ש"סרוק").
חלץ מתוכו טבלה של נכסים והחזר JSON תקין בלבד, ללא טקסט נוסף, במבנה:
{"headers": [..כותרות..], "rows": [{"<header>": "<value>", ...}, ...]}
הנחיות:
- שמור על שמות עמודות בעברית (למשל: מחיר, עיר, כתובת, רחוב, מס, חדרים, קומה, מ"ר, מעלית, חניה, סוג נכס, תיאור, שם, משפחה, טלפון, סוכן, פתיחה, עדכון, סוג עסקה).
- אם יש עמודות נוספות בקובץ — כלול אותן ב-headers וב-rows.
- אל תמציא נתונים. אם תא ריק החזר "".
- אל תחזיר תווי markdown או backticks. JSON בלבד.
שם הקובץ: ${file_name ?? "unknown.pdf"}.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        }],
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      throw new Error(`AI gateway ${aiRes.status}: ${t}`);
    }
    const aiJson = await aiRes.json();
    const raw: string = aiJson?.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

    let parsed: { headers: string[]; rows: Record<string, string>[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // try to find the first {...} block
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("AI returned non-JSON");
      parsed = JSON.parse(m[0]);
    }
    const headers = Array.isArray(parsed?.headers) ? parsed.headers.map(String) : [];
    const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];

    return new Response(JSON.stringify({ headers, rows }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-pdf-properties error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
