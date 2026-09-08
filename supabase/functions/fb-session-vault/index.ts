// fb-session-vault
// Stores / inspects / clears the workspace owner's encrypted Facebook session
// cookies so the cloud worker can publish to groups while the laptop is off.
//
// Actions (POST JSON): { action: "status" | "save" | "clear" }
//   save  -> { cookies: string | object[], user_agent?: string, expires_at?: string }
//
// The raw cookie payload is encrypted with AES-GCM (FB_SESSION_ENC_KEY) before
// it touches the database and is NEVER returned to the client.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { encryptSession } from "../_shared/sessionCrypto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ENC_KEY = Deno.env.get("FB_SESSION_ENC_KEY") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: userRes, error: userErr } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  const user = userRes?.user;
  if (userErr || !user) return json({ error: "unauthorized" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const action = String(body?.action ?? "status");

  if (action === "status") {
    const { data } = await admin
      .from("fb_cloud_sessions")
      .select("status, last_verified_at, expires_at, user_agent, updated_at, last_error")
      .eq("workspace_owner_id", user.id)
      .maybeSingle();
    return json({ success: true, session: data ?? null });
  }

  if (action === "clear") {
    const { error } = await admin.from("fb_cloud_sessions").delete().eq("workspace_owner_id", user.id);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, session: null });
  }

  if (action === "save") {
    if (!ENC_KEY) return json({ error: "missing_encryption_key" }, 500);
    const raw = body?.cookies;
    const serialized = typeof raw === "string" ? raw.trim() : JSON.stringify(raw ?? null);
    if (!serialized || serialized === "null" || serialized.length < 20) {
      return json({ error: "invalid_cookies", message: "לא נמצאו נתוני התחברות תקינים" }, 400);
    }
    if (serialized.length > 200_000) {
      return json({ error: "cookies_too_large", message: "נתוני ההתחברות גדולים מדי" }, 400);
    }

    let cookies_encrypted: string;
    try {
      cookies_encrypted = await encryptSession(serialized, ENC_KEY);
    } catch {
      return json({ error: "encryption_failed", message: "ההצפנה נכשלה, נסו שוב" }, 500);
    }

    const expires_at = typeof body?.expires_at === "string" && body.expires_at
      ? body.expires_at
      : new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await admin.from("fb_cloud_sessions").upsert(
      {
        workspace_owner_id: user.id,
        cookies_encrypted,
        user_agent: typeof body?.user_agent === "string" ? body.user_agent.slice(0, 512) : null,
        status: "active",
        last_verified_at: new Date().toISOString(),
        expires_at,
        last_error: null,
      },
      { onConflict: "workspace_owner_id" },
    );
    if (error) return json({ error: error.message }, 500);

    return json({ success: true, session: { status: "active", expires_at } });
  }

  return json({ error: "unknown_action" }, 400);
});
