// Sync the agent's Virtual Twin persona into an ElevenLabs Conversational AI agent.
// Creates the agent on first run, updates it on subsequent runs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { loadAgentPersona, renderPersonaPrompt } from "../_shared/persona.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ELEVEN_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function buildSystemPrompt(personaBlock: string, language: string, agentName: string) {
  return `You are the AI Voice Assistant for ${agentName}, a real-estate agent on the Realtyz platform.
You answer the agent's phone when they are unavailable. Speak in ${language === "he" ? "Hebrew" : "English"} unless the caller switches language.

Your job on every call:
1. Greet the caller warmly and explain you're answering on behalf of the agent.
2. Capture the caller's full name, phone number (confirm digits), and what property or service they are interested in.
3. Answer basic questions about availability, pricing range, neighborhood, and viewing times.
4. Offer to schedule a callback or a property viewing.
5. If the caller asks something you cannot confidently answer (legal, contractual, exact final price, complex negotiation), say you'll have the agent call them back personally — and use the request_callback tool with high priority.
6. Always end by confirming the next step out loud.

Conversation rules:
- Keep turns short (1-2 sentences). Wait for the caller.
- Never invent listing details. If unsure, say "let me have ${agentName} confirm that."
- Be polite, calm, and professional even if the caller is frustrated.

${personaBlock}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Load persona + voice config
    const persona = await loadAgentPersona(SUPABASE_URL, ANON_KEY, auth);
    const personaBlock = renderPersonaPrompt(persona);
    const language = persona?.language || "he";

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();
    const agentName = profile?.full_name || profile?.email?.split("@")[0] || "the agent";

    let { data: voiceCfg } = await admin
      .from("voice_agents")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!voiceCfg) {
      const ins = await admin.from("voice_agents").insert({ user_id: userId }).select().single();
      voiceCfg = ins.data;
    }

    const systemPrompt = buildSystemPrompt(personaBlock, language, agentName);
    const firstMessage = voiceCfg?.greeting?.trim() ||
      (language === "he"
        ? `שלום, הגעת ל${agentName}. אני העוזרת הקולית שלו ואשמח לעזור — איך אפשר לקרוא לך?`
        : `Hi, you've reached ${agentName}'s line. I'm the AI assistant — may I have your name?`);

    const voiceId = voiceCfg?.elevenlabs_voice_id || "EXAVITQu4vr4xnSDxMaL";

    // Tool definition: callback request
    const clientTools = [
      {
        name: "request_callback",
        description: "Flag this call as needing a high-priority human callback when AI cannot resolve the request.",
        parameters: {
          type: "object",
          properties: {
            reason: { type: "string", description: "One sentence explaining why the agent must call back." },
            urgency: { type: "string", enum: ["high", "normal"] },
          },
          required: ["reason"],
        },
        type: "client",
        expects_response: false,
      },
    ];

    const conversationConfig = {
      agent: {
        prompt: { prompt: systemPrompt },
        first_message: firstMessage,
        language: language === "he" ? "he" : "en",
      },
      tts: { voice_id: voiceId },
    };

    let agentId = voiceCfg?.elevenlabs_agent_id || null;
    let resp: Response;

    if (agentId) {
      // Update
      resp = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
        method: "PATCH",
        headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Realtyz · ${agentName}`,
          conversation_config: conversationConfig,
          platform_settings: { client_tools: clientTools },
        }),
      });
    } else {
      // Create
      resp = await fetch(`https://api.elevenlabs.io/v1/convai/agents/create`, {
        method: "POST",
        headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Realtyz · ${agentName}`,
          conversation_config: conversationConfig,
          platform_settings: { client_tools: clientTools },
        }),
      });
    }

    if (!resp.ok) {
      const txt = await resp.text();
      console.error("[elevenlabs-agent-sync] failed", resp.status, txt);
      return json({ error: `ElevenLabs ${resp.status}: ${txt.slice(0, 400)}` }, 502);
    }

    const body = await resp.json();
    if (!agentId) agentId = body.agent_id || body.id;

    await admin.from("voice_agents").update({
      elevenlabs_agent_id: agentId,
      elevenlabs_voice_id: voiceId,
      language,
      last_synced_at: new Date().toISOString(),
    }).eq("user_id", userId);

    return json({ ok: true, agent_id: agentId });
  } catch (e) {
    console.error("[elevenlabs-agent-sync] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
