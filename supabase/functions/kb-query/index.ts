// Knowledge Base query: keyword-based retrieval over knowledge_chunks.
// Embeddings are disabled because the Lovable AI Gateway no longer exposes an
// embedding model. We tokenize the query and rank chunks by token overlap.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  query: z.string().min(1).max(2000),
  match_count: z.number().int().min(1).max(20).default(5),
  target_user_id: z.string().uuid().optional(),
});

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { query, match_count, target_user_id } = parsed.data;

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

    // Pull active chunks for this user; rank by simple token overlap.
    const { data: chunks, error } = await admin
      .from("knowledge_chunks")
      .select("id, document_id, content, knowledge_documents!inner(title, is_active)")
      .eq("user_id", userId)
      .eq("knowledge_documents.is_active", true)
      .limit(500);
    if (error) throw error;

    const qTokens = Array.from(new Set(tokenize(query)));
    const scored = (chunks ?? []).map((c: any) => {
      const text = (c.content as string).toLowerCase();
      let score = 0;
      for (const t of qTokens) {
        if (text.includes(t)) score += 1;
      }
      return {
        id: c.id,
        document_id: c.document_id,
        document_title: c.knowledge_documents?.title ?? "",
        content: c.content,
        similarity: qTokens.length ? score / qTokens.length : 0,
      };
    });
    scored.sort((a, b) => b.similarity - a.similarity);
    const matches = scored.filter((s) => s.similarity > 0).slice(0, match_count);

    return new Response(JSON.stringify({ success: true, matches }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("kb-query error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
