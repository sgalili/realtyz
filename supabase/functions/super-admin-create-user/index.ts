// super-admin-create-user
// ─────────────────────────
// Creates a new auth user, sets up their own workspace with 1000 NIS balance,
// unlimited plan, and (optionally) sends WhatsApp credentials via GreenAPI.
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
  send_whatsapp: z.boolean().default(false),
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
    const { email, password, full_name, phone_e164, send_whatsapp, initial_balance_agorot } = parsed.data;
    const normalizedPhone = normalizeIsraeliPhone(phone_e164);

    // Create the auth user (auto-confirmed so they can log in immediately)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      ...(normalizedPhone ? { phone: `+${normalizedPhone}`, phone_confirm: true } : {}),
      email_confirm: true,
      user_metadata: { full_name: full_name ?? "", created_by_super_admin: true, ...(normalizedPhone ? { phone_number: normalizedPhone } : {}) },
    });
    if (createErr || !created.user) {
      return new Response(JSON.stringify({ error: createErr?.message ?? "createUser failed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const newUid = created.user.id;

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
        workspace_owner_id: newUid,
      }, { onConflict: "id" });
    if (profErr) {
      console.error("profile upsert", profErr);
    }

    // Give them the managing_broker role so they own their workspace
    await admin.from("user_roles")
      .upsert({ user_id: newUid, role: "managing_broker" }, { onConflict: "user_id,role" });

    // Audit
    await admin.from("audit_logs").insert({
      actor_id: caller.id,
      actor_email: caller.email ?? null,
      action: "super_admin.create_user",
      target_table: "auth.users",
      target_id: newUid,
      details: { email, initial_balance_agorot, send_whatsapp: !!send_whatsapp },
    });

    // Optional: send WhatsApp credentials via GreenAPI (using super admin's wa_providers)
    let wa_status: "skipped" | "sent" | "failed" = "skipped";
    let wa_error: string | null = null;
    if (send_whatsapp && phone_e164) {
      try {
        const msg = [
          `שלום${full_name ? ` ${full_name}` : ""},`,
          `נפתח עבורך חשבון ב-Realtyz AI.`,
          ``,
          `כתובת התחברות: ${new URL(req.url).origin.replace(/functions.*/, "")}`,
          `אימייל: ${email}`,
          `סיסמה זמנית: ${password}`,
          ``,
          `יתרה התחלתית: ${(initial_balance_agorot / 100).toFixed(0)} ₪.`,
          `מומלץ לשנות סיסמה לאחר ההתחברות הראשונה.`,
        ].join("\n");

        const r = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: auth,
            apikey: ANON_KEY,
          },
          body: JSON.stringify({ phone_number: phone_e164, message: msg, force_provider: "GreenAPI" }),
        });
        const body = await r.json().catch(() => ({}));
        if (r.ok && body?.success) wa_status = "sent";
        else { wa_status = "failed"; wa_error = body?.error ?? `HTTP ${r.status}`; }
      } catch (e) {
        wa_status = "failed";
        wa_error = e instanceof Error ? e.message : String(e);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      user_id: newUid,
      email,
      wa_status,
      wa_error,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("super-admin-create-user error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
