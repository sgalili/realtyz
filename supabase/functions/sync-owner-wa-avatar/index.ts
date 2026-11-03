// Fetches the authenticated user's own WhatsApp profile photo (Green API)
// and stores it as their TORAFF profile avatar. Best-effort, never throws.
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

    // Optional target: a Super Admin may resolve another workspace owner's photo.
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body */ }
    const requested = typeof body.owner_id === "string" ? body.owner_id : null;
    let targetId = user.id;
    let targetMeta: Record<string, unknown> | null = (user.user_metadata as Record<string, unknown> | null) ?? null;
    let targetPhone: string | null | undefined = user.phone;
    if (requested && requested !== user.id) {
      const { data: role } = await admin.from("user_roles").select("role")
        .eq("user_id", user.id).eq("role", "super_admin").maybeSingle();
      if (!role) return json({ error: "forbidden" }, 403);
      targetId = requested;
      const { data: tu } = await admin.auth.admin.getUserById(requested);
      targetMeta = (tu?.user?.user_metadata as Record<string, unknown> | null) ?? null;
      targetPhone = tu?.user?.phone ?? null;
    }

    // Don't overwrite an avatar the user already has.
    const { data: profile } = await admin
      .from("profiles")
      .select("avatar_url, phone")
      .eq("id", targetId)
      .maybeSingle();
    if (profile?.avatar_url) return json({ updated: false, reason: "avatar_exists", avatar_url: profile.avatar_url });

    // Own Green API line first; otherwise the platform Green API instance is
    // used read-only to look up the new user's own WhatsApp profile photo.
    const ownCreds = await resolveGreenCreds(admin, targetId);
    const creds = ownCreds ?? (await resolveGreenCreds(admin));
    if (!creds) return json({ updated: false, reason: "no_whatsapp_connection" });

    const phone =
      toIntlDigits(profile?.phone) ??
      toIntlDigits(targetMeta?.phone) ??
      toIntlDigits(targetMeta?.phone_number) ??
      toIntlDigits(targetPhone) ??
      (ownCreds ? await getLinkedPhone(ownCreds).catch(() => null) : null);
    const digits = toIntlDigits(phone);
    if (!digits) return json({ updated: false, reason: "no_phone" });

    const avatar = await fetchGreenAvatar(creds, `${digits}@c.us`);
    if (!avatar) return json({ updated: false, reason: "no_wa_avatar" });

    await admin.from("profiles").update({ avatar_url: avatar }).eq("id", targetId);
    await admin.auth.admin.updateUserById(targetId, {
      user_metadata: { ...(targetMeta ?? {}), avatar_url: avatar },
    });

    return json({ updated: true, avatar_url: avatar });
  } catch (e) {
    return json({ updated: false, error: e instanceof Error ? e.message : "unknown" }, 200);
  }
});
