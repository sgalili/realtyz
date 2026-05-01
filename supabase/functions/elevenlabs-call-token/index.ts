// Returns a short-lived WebRTC conversation token for the caller's UI to connect
// to the agent's ElevenLabs Conversational AI agent.
//
// Public endpoint (verify_jwt = false) so leads without an account can call.
// To prevent abuse, callers must pass a valid voice_agents.user_id (the agent
// being called); we resolve the elevenlabs_agent_id from the DB.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ELEVEN_KEY = Deno.env.get("ELEVENLABS_API_KEY")!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const agentUserId: string | undefined = body.agent_user_id;
    if (!agentUserId) return json({ error: "agent_user_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: cfg } = await admin
      .from("voice_agents")
      .select("elevenlabs_agent_id, availability")
      .eq("user_id", agentUserId)
      .maybeSingle();

    if (!cfg?.elevenlabs_agent_id) return json({ error: "AI voice agent is not configured" }, 404);

    const resp = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${cfg.elevenlabs_agent_id}`,
      { headers: { "xi-api-key": ELEVEN_KEY } },
    );
    if (!resp.ok) {
      const txt = await resp.text();
      return json({ error: `Token request failed: ${resp.status}`, detail: txt.slice(0, 300) }, 502);
    }
    const data = await resp.json();
    return json({
      token: data.token,
      agent_id: cfg.elevenlabs_agent_id,
      availability: cfg.availability,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
