// Knowledge Base ingest: chunk + embed text and store for RAG retrieval.
// Accepts { title, raw_text, source_type?, source_metadata? } OR { document_id } to re-embed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";
import { maskPii } from "../_shared/pii.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  title: z.string().min(1).max(300),
  raw_text: z.string().max(5_000_000).optional(),
  file_data_url: z.string().max(30_000_000).optional(),
  mime_type: z.string().max(120).optional(),
  source_type: z.enum(["pdf", "text", "whatsapp", "image", "video", "audio"]).default("text"),
  source_metadata: z.record(z.any()).optional(),
  // When invoked from trusted server (e.g., WA webhook), supply user_id directly.
  target_user_id: z.string().uuid().optional(),
}).refine((v) => Boolean(v.raw_text?.trim() || v.file_data_url?.trim()), {
  message: "raw_text or file_data_url is required",
});

function chunkText(text: string, maxChars = 1200, overlap = 150): string[] {
  const clean = text.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= maxChars) return [clean];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + maxChars, clean.length);
    if (end < clean.length) {
      // try to break at sentence or newline boundary
      const slice = clean.slice(i, end);
      const breakAt = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "), slice.lastIndexOf("।"));
      if (breakAt > maxChars * 0.5) end = i + breakAt + 1;
    }
    chunks.push(clean.slice(i, end).trim());
    i = end - overlap;
    if (i < 0) i = 0;
    if (end >= clean.length) break;
  }
  return chunks.filter((c) => c.length > 0);
}

// Embeddings disabled: Lovable AI Gateway no longer exposes an embedding model.
// Chunks are stored without vectors and retrieved via keyword search in kb-query.

async function analyzeMedia(title: string, dataUrl: string, mimeType: string | undefined, sourceType: string, apiKey: string): Promise<string> {
  const prompt = `Analyze this ${sourceType} file for a political campaign knowledge base.
Return Hebrew text only. Include: concise summary, visible/spoken facts, names, claims, dates, places, sentiment, and any campaign-relevant insights.
File name: ${title}. MIME type: ${mimeType ?? "unknown"}.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
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

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`media analysis failed ${res.status}: ${t}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") throw new Error("media analysis returned no text");
  return content;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { title, raw_text, file_data_url, mime_type, source_type, source_metadata, target_user_id } = parsed.data;

    // Resolve user: either JWT (user-initiated) or target_user_id (server-to-server w/ service role).
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.startsWith("Bearer ") && !target_user_id) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      userId = user?.id ?? null;
    } else if (target_user_id) {
      userId = target_user_id;
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    // Strip NULL bytes (Postgres text columns reject \u0000) and BOM.
    const sanitize = (s: string) => s.replace(/\u0000/g, "").replace(/^\uFEFF/, "");
    const rawFinalText = sanitize(
      raw_text?.trim() || await analyzeMedia(title, file_data_url!, mime_type, source_type, LOVABLE_API_KEY),
    );
    if (!rawFinalText) {
      return new Response(JSON.stringify({ error: "empty document content" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Privacy Guardrail: mask PII (IDs, cards, IBAN, emails, phones) before
    // persisting to the Strategy Bank. Originals are NOT stored.
    const { text: finalText, hits: piiHits } = maskPii(rawFinalText);

    // 1) create document row
    const { data: doc, error: docErr } = await admin
      .from("knowledge_documents")
      .insert({
        user_id: userId,
        source_type,
        title,
        raw_text: finalText,
        source_metadata: {
          ...(source_metadata ?? {}),
          analyzed_from_media: Boolean(file_data_url),
          mime_type: mime_type ?? null,
          pii_masked: piiHits,
        },
        is_active: true,
      })
      .select()
      .single();
    if (docErr) throw docErr;

    // 2) chunk (no embeddings — gateway dropped support; keyword search used downstream)
    const chunks = chunkText(finalText);
    const rows: Array<{ document_id: string; user_id: string; chunk_index: number; content: string }> = [];
    for (let i = 0; i < chunks.length; i++) {
      rows.push({ document_id: doc.id, user_id: userId, chunk_index: i, content: chunks[i] });
    }

    if (rows.length > 0) {
      const { error: insErr } = await admin.from("knowledge_chunks").insert(rows);
      if (insErr) throw insErr;
    }

    await admin.from("knowledge_documents").update({ chunk_count: rows.length }).eq("id", doc.id);

    return new Response(JSON.stringify({ success: true, document_id: doc.id, chunks: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("kb-ingest error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
