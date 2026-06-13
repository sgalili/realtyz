// ingest-system-rule
// Captures explicit owner/tenant behavior rules from the KB UI or from
// WhatsApp text/voice notes. Voice notes are transcribed via Lovable AI
// Gateway (Gemini natively transcribes audio). The raw input is normalized
// into a concise English imperative rule, classified as
// directive|negative|positive, embedded, and inserted into
// `system_intelligence_kb` — scoped by the caller's active workspace.
//
// Body: { text?, audio_base64?, audio_format?, source?, role?, signal?,
//         workspace_owner_id? (admin/service only), actor_user_id? (service only) }

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

const SUPPORTED_SOURCES = new Set([
  "kb_ui", "whatsapp_text", "whatsapp_voice", "approval", "rejection", "edit_diff",
]);
const SUPPORTED_ROLES = new Set(["owner", "tenant", "system"]);
const SUPPORTED_SIGNALS = new Set(["directive", "negative", "positive"]);

async function transcribeAudio(b64: string, format = "ogg"): Promise<string | null> {
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Transcribe this voice note verbatim. Return ONLY the spoken text in its original language (likely Hebrew). No commentary." },
            { type: "input_audio", input_audio: { data: b64, format } },
          ],
        }],
        temperature: 0,
        max_tokens: 800,
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return String(j?.choices?.[0]?.message?.content ?? "").trim() || null;
  } catch {
    return null;
  }
}

async function normalizeRule(raw: string): Promise<{ rule_text: string; signal: "directive" | "negative" | "positive" } | null> {
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content:
              "You normalize Hebrew/English broker instructions into ONE concise English imperative rule for future AI generation. " +
              'Return STRICT JSON: {"rule":"<imperative English rule, max 220 chars, starts with a verb>","signal":"directive|negative|positive"}. ' +
              "signal=negative if the rule says NOT to do something. signal=directive for a positive ALWAYS/PREFER instruction. " +
              "signal=positive only for reinforcement of an existing approved draft style. No prose outside JSON.",
          },
          { role: "user", content: raw.slice(0, 2000) },
        ],
        temperature: 0.1,
        max_tokens: 200,
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const content = String(j?.choices?.[0]?.message?.content ?? "").trim();
    const parsed = JSON.parse(content);
    const rule = String(parsed?.rule ?? "").trim();
    const signal = String(parsed?.signal ?? "directive").trim().toLowerCase();
    if (!rule) return null;
    return {
      rule_text: rule.slice(0, 500),
      signal: SUPPORTED_SIGNALS.has(signal) ? (signal as any) : "directive",
    };
  } catch {
    return null;
  }
}

async function embed(text: string): Promise<number[] | null> {
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai/text-embedding-3-small", input: text.slice(0, 4000) }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const v = j?.data?.[0]?.embedding;
    return Array.isArray(v) ? v : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({} as any));
    const source = SUPPORTED_SOURCES.has(body?.source) ? body.source : "kb_ui";
    const requestedRole = SUPPORTED_ROLES.has(body?.role) ? body.role : "owner";

    // Identify caller: prefer JWT (user-initiated), fall back to service-mode for
    // server-to-server calls (webhooks, approval signals).
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");

    let actorUserId: string | null = null;
    let workspaceOwnerId: string | null = null;
    let isService = false;

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
    } else if (jwt === SERVICE_KEY || authHeader.includes(SERVICE_KEY)) {
      isService = true;
      workspaceOwnerId = body?.workspace_owner_id ?? null;
      actorUserId = body?.actor_user_id ?? workspaceOwnerId;
    }

    if (!workspaceOwnerId) {
      return new Response(JSON.stringify({ error: "no workspace context" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve raw text (transcribe audio if needed).
    let rawText: string | null = (body?.text ?? "").toString().trim() || null;
    if (!rawText && body?.audio_base64) {
      rawText = await transcribeAudio(String(body.audio_base64), String(body?.audio_format ?? "ogg"));
    }
    if (!rawText) {
      return new Response(JSON.stringify({ error: "empty input" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize into a canonical imperative rule.
    const normalized = await normalizeRule(rawText);
    if (!normalized) {
      return new Response(JSON.stringify({ captured: false, reason: "normalization_failed", raw: rawText }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Caller may force a signal (e.g. approval = positive).
    const finalSignal = SUPPORTED_SIGNALS.has(body?.signal) ? body.signal : normalized.signal;

    const weight =
      requestedRole === "owner" ? 2.0 :
      requestedRole === "tenant" ? 0.5 :
      1.0;

    const vec = await embed(normalized.rule_text);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await admin
      .from("system_intelligence_kb")
      .insert({
        workspace_owner_id: workspaceOwnerId,
        created_by: actorUserId,
        actor_role: requestedRole,
        source,
        rule_text: normalized.rule_text,
        raw_input: rawText.slice(0, 4000),
        signal: finalSignal,
        weight,
        embedding: vec as any,
        metadata: { service: isService, ...(body?.metadata ?? {}) },
      })
      .select("id, rule_text, signal, weight")
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ captured: true, rule: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
