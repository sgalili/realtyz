// Fetches the authenticated user's own WhatsApp profile photo (Green API)
// and stores it as their Realtyz profile avatar. Best-effort, never throws.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { resolveGreenCreds, fetchGreenAvatar, toIntlDigits } from "../_shared/greenApiCreds.ts";
import { getLinkedPhone } from "../_shared/greenApi.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: auth } = await userClient.auth.getUser();
    const user = auth?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(url, service);

    // Don't overwrite an avatar the user already has.
    const { data: profile } = await admin
      .from("profiles")
      .select("avatar_url, phone")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.avatar_url) return json({ updated: false, reason: "avatar_exists" });

    const creds = await resolveGreenCreds(admin, user.id);
    if (!creds) return json({ updated: false, reason: "no_whatsapp_connection" });

    const phone =
      toIntlDigits(profile?.phone) ??
      toIntlDigits((user.user_metadata as Record<string, unknown> | null)?.phone) ??
      toIntlDigits(user.phone) ??
      (await getLinkedPhone(creds).catch(() => null));
    const digits = toIntlDigits(phone);
    if (!digits) return json({ updated: false, reason: "no_phone" });

    const avatar = await fetchGreenAvatar(creds, `${digits}@c.us`);
    if (!avatar) return json({ updated: false, reason: "no_wa_avatar" });

    await admin.from("profiles").update({ avatar_url: avatar }).eq("id", user.id);
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...(user.user_metadata ?? {}), avatar_url: avatar },
    });

    return json({ updated: true, avatar_url: avatar });
  } catch (e) {
    return json({ updated: false, error: e instanceof Error ? e.message : "unknown" }, 200);
  }
});
