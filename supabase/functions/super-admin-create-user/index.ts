// super-admin-create-user
// ─────────────────────────
// Super Admin-only silent broker provisioning. Never dispatches credentials or invitations.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  full_name: z.string().min(1).max(200).optional(),
  phone_e164: z.string().min(8).max(20).optional(),       // for WhatsApp invite (e.g. 9725XXXXXXXX)
  broker_license_number: z.string().regex(/^[1-9][0-9]{3,9}$/),
  approve_broker: z.literal(true),
  initial_balance_agorot: z.number().int().nonnegative().default(100000),
});

const normalizeIsraeliPhone = (value?: string): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (/^05\d{8}$/.test(digits)) return `972${digits.slice(1)}`;
  if (/^9725\d{8}$/.test(digits)) return digits;
  return null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is super_admin
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRows } = await admin
      .from("user_roles").select("role").eq("user_id", caller.id);
    const isSuper = (roleRows ?? []).some((r) => r.role === "super_admin");
    if (!isSuper) {
      return new Response(JSON.stringify({ error: "super_admin required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { email, password, full_name, phone_e164, broker_license_number, initial_balance_agorot } = parsed.data;
    const normalizedPhone = normalizeIsraeliPhone(phone_e164);

    if (!normalizedPhone) return new Response(JSON.stringify({ error: "נדרש מספר נייד תקין לכניסה באמצעות SMS" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Create the auth user (auto-confirmed so they can log in immediately), or
    // repair/update an existing user created by the super admin.
    let createdUser = null;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      ...(normalizedPhone ? { phone: `+${normalizedPhone}`, phone_confirm: true } : {}),
      email_confirm: true,
      user_metadata: { full_name: full_name ?? "", created_by_super_admin: true, ...(normalizedPhone ? { phone_number: normalizedPhone } : {}) },
    });
    if (created.user) {
      createdUser = created.user;
    } else {
      return new Response(JSON.stringify({ error: createErr?.message ?? "createUser failed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const newUid = createdUser.id;

    // Upsert profile: unlimited workspace, 1000 NIS balance, owns own workspace.
    // (handle_new_user trigger likely inserted a base row already.)
    const { error: profErr } = await admin
      .from("profiles")
      .upsert({
        id: newUid,
        email,
        full_name: full_name ?? "",
        plan_status: "active",
        wallet_balance_agorot: initial_balance_agorot,
        is_unlimited: true,
        created_by_super_admin: true,
        phone: normalizedPhone,
        workspace_owner_id: newUid,
      }, { onConflict: "id" });
    if (profErr) { await admin.auth.admin.deleteUser(newUid); throw profErr; }
    const { error: onboardingError } = await admin.from('admin_broker_onboarding').insert({ user_id: newUid, created_by: caller.id });
    if (onboardingError) { await admin.auth.admin.deleteUser(newUid); throw onboardingError; }
    const { error: brokerError } = await userClient.rpc('finalize_admin_broker_setup', { _user_id: newUid, _license: broker_license_number });
    if (brokerError) { await admin.auth.admin.deleteUser(newUid); throw brokerError; }

    // Audit
    await admin.from("audit_logs").insert({
      actor_id: caller.id,
      actor_email: caller.email ?? null,
      action: "super_admin.create_user",
      target_table: "auth.users",
      target_id: newUid,
      details: { email, phone_e164: normalizedPhone, initial_balance_agorot, silent: true },
    });

    return new Response(JSON.stringify({
      success: true,
      user_id: newUid,
      email,
      wa_status: "skipped",
      silent: true,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("super-admin-create-user error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
