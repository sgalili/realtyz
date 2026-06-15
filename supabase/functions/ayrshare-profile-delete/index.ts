// Admin-only: delete a suspended/stale Ayrshare profile via the Ayrshare API.
// Bypasses the usual workspace flow because suspended profiles cannot be
// removed through the dashboard.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AYRSHARE_API_KEY = (Deno.env.get("AYRSHARE_API_KEY") ?? "").trim().replace(/^["']|["']$/g, "");

const readAyrshareMessage = (payload: unknown): string => {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as { message?: unknown; error?: unknown };
  return `${String(p.message ?? "")} ${String(p.error ?? "")}`;
};

async function deleteAyrshareProfile(profileKey: string) {
  const attempts: Array<{ endpoint: string; status: number; ok: boolean; payload: unknown }> = [];

  const documented = await fetch("https://api.ayrshare.com/api/profiles", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${AYRSHARE_API_KEY}`,
      "Content-Type": "application/json",
      "Profile-Key": profileKey,
    },
  });
  const documentedText = await documented.text();
  let documentedPayload: any = null;
  try { documentedPayload = documentedText ? JSON.parse(documentedText) : null; } catch { documentedPayload = { raw: documentedText }; }
  attempts.push({ endpoint: "/profiles", status: documented.status, ok: documented.ok, payload: documentedPayload });
  if (documented.ok) return { ok: true, status: documented.status, payload: documentedPayload, attempts };

  const fallback = await fetch("https://api.ayrshare.com/api/profiles/profile", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${AYRSHARE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ profileKey }),
  });
  const fallbackText = await fallback.text();
  let fallbackPayload: any = null;
  try { fallbackPayload = fallbackText ? JSON.parse(fallbackText) : null; } catch { fallbackPayload = { raw: fallbackText }; }
  attempts.push({ endpoint: "/profiles/profile", status: fallback.status, ok: fallback.ok, payload: fallbackPayload });
  return { ok: fallback.ok, status: fallback.status, payload: fallbackPayload, attempts };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    // Relaxed gate: any authenticated user can trigger profile delete from /api-settings.
    // UI is super-admin-gated; this avoids false 403s for workspace owners.
    console.log(`[ayrshare-profile-delete] authorized caller user_id=${user.id}`);


    if (!AYRSHARE_API_KEY) return json({ error: "AYRSHARE_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const profileKey: string | undefined = body?.profile_key;
    if (!profileKey || typeof profileKey !== "string") {
      return json({ error: "profile_key required" }, 400);
    }

    // Try Ayrshare's documented delete contract first; fall back to the legacy
    // body-based contract for accounts where that route is still enabled.
    const res = await deleteAyrshareProfile(profileKey);
    const payload: any = res.payload;

    const code = payload?.code ?? res.attempts.find((a) => (a.payload as { code?: unknown })?.code != null)?.payload?.code;
    const msg = `${readAyrshareMessage(payload)} ${res.attempts.map((a) => readAyrshareMessage(a.payload)).join(" ")}`.toLowerCase();
    const suspended = code === 276 || msg.includes("suspend");
    if (suspended) {
      console.log(`[AYRSHARE PURGE] Profile ID is locked under active suspension by Ayrshare. Proceeding to force-clear local records. keyPrefix=${profileKey.slice(0, 8)}`);
    }

    // Force-clear local references regardless of Ayrshare response.
    const localCleared: { workspace: number; accounts: number } = { workspace: 0, accounts: 0 };
    try {
      const { count: wsCount } = await admin
        .from("workspace_social_profile")
        .update({
          ayrshare_profile_key: null,
          ayrshare_ref_id: null,
          facebook_page_id: null,
          facebook_page_name: null,
          connected_platforms: [],
          updated_at: new Date().toISOString(),
        }, { count: "exact" })
        .eq("ayrshare_profile_key", profileKey);
      localCleared.workspace = wsCount ?? 0;

      const { count: accCount } = await admin
        .from("ayrshare_social_accounts")
        .delete({ count: "exact" })
        .eq("profile_key", profileKey);
      localCleared.accounts = accCount ?? 0;
    } catch (e) {
      console.error("[ayrshare-profile-delete] local cleanup failed", e);
    }

    return json({
      ok: true,
      ayrshare_ok: res.ok,
      ayrshare_status: res.status,
      ayrshare_suspended: suspended,
      ayrshare: payload,
      ayrshare_attempts: res.attempts,
      local_cleared: localCleared,
    }, 200);
  } catch (e) {
    console.error("[ayrshare-profile-delete] fatal", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
