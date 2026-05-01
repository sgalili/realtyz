// Audio transcription via Lovable AI Gateway (Gemini supports audio inputs).
// Accepts { audio_data_url: string, mime_type?: string, language?: string }
// Returns { text: string }
import { z } from "https://esm.sh/zod@3.25.76";
import { logIntegrationError } from "../_shared/logIntegrationError.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  audio_data_url: z.string().min(20).max(30_000_000),
  mime_type: z.string().max(120).optional(),
  language: z.string().max(20).optional().default("he"),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { audio_data_url, language } = parsed.data;

    const prompt = language === "he"
      ? "תמלל את הקובץ הקולי הזה במדויק לעברית. החזר טקסט בלבד, ללא הקדמה או הערות."
      : `Transcribe this audio file accurately to ${language}. Return text only, no preamble or commentary.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: audio_data_url } },
          ],
        }],
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      return new Response(JSON.stringify({ error: `transcription failed ${res.status}: ${t}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const j = await res.json();
    const text: string = j?.choices?.[0]?.message?.content?.trim?.() ?? "";
    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("transcribe-audio error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
