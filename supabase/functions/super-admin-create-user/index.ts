// super-admin-create-user
// ─────────────────────────
// Super Admin-only silent broker/developer provisioning. Never dispatches credentials or invitations.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";
import { requireCaller, isSuperAdmin } from "../_shared/authz.ts";
import { checkAdminBrokerRegistry } from "../_shared/adminBrokerRegistry.ts";
import { BATCH_NO_EMAIL_DOMAIN } from "../_shared/brokerBatchImport.ts";
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { allowsQueuedContactlessAccount, developerImportPlaceholderId, requiresLicenseVerification } from '../_shared/importedAccountPolicy.ts';

const Body = z.object({
  email: z.string().email().nullish(),
  password: z.string().min(8).max(128).optional(),
  full_name: z.string().min(1).max(200).nullish(),
  phone_e164: z.string().min(8).max(20).nullish(),       // for WhatsApp invite (e.g. 9725XXXXXXXX)
  broker_license_number: z.string().regex(/^[1-9][0-9]{3,9}$/).nullish(),
  approve_broker: z.boolean().default(false),
  user_type: z.enum(["broker", "developer", "property_owner", "property_seeker", "affiliate"]).default("broker"),
  action: z.enum(["create", "check_registry"]).default("create"),
  import_job_id: z.string().uuid().optional(),
  import_source_url: z.string().max(500).nullish(),
  pending_contact: z.boolean().default(false), // explicit Super Admin request for a registry-verified broker with no known mobile
  initial_balance_agorot: z.number().int().nonnegative().default(100000),
});

const normalizeIsraeliPhone = (value?: string): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (/^05\d{8}$/.test(digits)) return `972${digits.slice(1)}`;
  if (/^9725\d{8}$/.test(digits)) return digits;
  return null;
};

/** Permanent account-setup rejections: answered as 4xx so batch imports skip the broker instead of retrying. */
const KNOWN_REJECTIONS: Record<string, { status: number; detail: string }> = {
  license_already_approved_for_another_account: { status: 409, detail: 'מספר הרישיון כבר משויך לחשבון קיים' },
  invalid_pending_broker: { status: 409, detail: 'החשבון אינו חשבון ממתין שנוצר בייבוא' },
  forbidden: { status: 403, detail: 'אין הרשאה' },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) throw new Error('configuration_unavailable');

    const verifiedCaller = await requireCaller(req, ['user', 'service']);
    if (verifiedCaller instanceof Response) return verifiedCaller;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const input = await req.json().catch(() => null);
    let actorId: string;
    if (verifiedCaller.kind === 'user') actorId = verifiedCaller.userId;
    else {
      const { data: job } = await admin.from('broker_import_jobs').select('created_by,status').eq('id', input?.import_job_id ?? '').maybeSingle();
      if (!job || !['running','paused'].includes(job.status)) return new Response(JSON.stringify({error:'forbidden'}),{status:403,headers:corsHeaders});
      actorId = job.created_by;
    }
    if (!await isSuperAdmin(actorId, admin)) return new Response(JSON.stringify({error:'forbidden'}),{status:403,headers:corsHeaders});
    const auth = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {global:{headers:{Authorization:auth}}});
    const parsed = Body.safeParse(input);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { full_name, phone_e164, broker_license_number, initial_balance_agorot, user_type, approve_broker, action, import_job_id, import_source_url } = parsed.data;
    const registry = requiresLicenseVerification(user_type) && broker_license_number ? await checkAdminBrokerRegistry(broker_license_number, full_name ?? '') : null;
    if (action === 'check_registry') return new Response(JSON.stringify(registry ?? {valid:false,reason:'invalid_license'}),{headers:{...corsHeaders,'Content-Type':'application/json'}});
    if (requiresLicenseVerification(user_type) && (!broker_license_number || (!registry?.valid && !approve_broker))) return new Response(JSON.stringify({error:'נדרש אימות רישיון או אישור מפורש של מנהל'}),{status:400,headers:corsHeaders});
    const normalizedPhone = normalizeIsraeliPhone(phone_e164);

    // Queued imports may lack a mobile. Brokers remain pending contact; developers need no license or phone.
    const manualVerifiedPending = !normalizedPhone && !import_job_id && verifiedCaller.kind === 'user' && user_type === 'broker' && parsed.data.pending_contact && registry?.valid === true;
    const pendingContact = !normalizedPhone && (allowsQueuedContactlessAccount(user_type, import_job_id) || manualVerifiedPending);
    if (!normalizedPhone && !pendingContact) return new Response(JSON.stringify({ error: "נדרש מספר נייד תקין לכניסה באמצעות SMS" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const placeholderId = normalizedPhone ?? (user_type === 'developer' && import_job_id && import_source_url
      ? await developerImportPlaceholderId(import_job_id, import_source_url)
      : `${user_type === 'developer' ? 'developer' : `license-${broker_license_number}`}-${crypto.randomUUID().slice(0, 8)}`);
    const email = parsed.data.email ?? `${placeholderId}@${BATCH_NO_EMAIL_DOMAIN}`;
    const password = parsed.data.password ?? crypto.randomUUID() + crypto.randomUUID();
    // Create the auth user (auto-confirmed so they can log in immediately), or
    // repair/update an existing user created by the super admin.
    let createdUser = null;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      ...(normalizedPhone ? { phone: `+${normalizedPhone}`, phone_confirm: true } : {}),
      email_confirm: !parsed.data.email,
      user_metadata: { full_name: full_name ?? "", created_by_super_admin: true, ...(normalizedPhone ? { phone_number: normalizedPhone } : {}) },
    });
    if (created.user) {
      createdUser = created.user;
    } else {
      const msg = createErr?.message ?? "createUser failed";
      const dupEmail = /email.*already|already.*registered/i.test(msg) || (createErr as any)?.code === "email_exists";
      const dupPhone = /phone.*already|phone_exists/i.test(msg) || (createErr as any)?.code === "phone_exists";
      if (dupEmail || dupPhone) {
        // A repeated developer request may continue only to the exact account audited for this job+source.
        if (user_type === 'developer' && import_job_id && import_source_url) {
          const { data: priorProfiles } = await admin.from('profiles').select('id').eq(dupPhone ? 'phone' : 'email', dupPhone ? normalizedPhone : email).eq('created_by_super_admin', true).limit(2);
          if (priorProfiles?.length === 1) {
            const [{ data: priorRole }, { data: priorAudit }] = await Promise.all([
              admin.from('user_roles').select('role').eq('user_id', priorProfiles[0].id).eq('role', 'developer').maybeSingle(),
              admin.from('audit_logs').select('target_id').eq('action', 'super_admin.create_user').eq('target_id', priorProfiles[0].id).eq('details->>import_job_id', import_job_id).eq('details->>import_source_url', import_source_url).maybeSingle(),
            ]);
            if (priorRole && priorAudit) return new Response(JSON.stringify({ success: true, user_id: priorProfiles[0].id, email, wa_status: 'skipped', silent: true, duplicate: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        }
        // Expected validation outcome: answer 200 with a friendly message so the UI shows a toast instead of crashing.
        return new Response(JSON.stringify({
          ok: false,
          code: dupEmail ? "email_exists" : "phone_exists",
          error: dupEmail
            ? "כתובת האימייל הזו כבר רשומה במערכת. השתמשו בכתובת אחרת או ערכו את המשתמש הקיים בטבלת המשתמשים."
            : "מספר הנייד הזה כבר משויך למשתמש קיים. ערכו את המשתמש הקיים בטבלת המשתמשים.",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: msg }), {
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
    if (user_type === 'broker') {
      const { error: onboardingError } = await admin.from('admin_broker_onboarding').insert({ user_id: newUid, created_by: actorId, import_source: import_job_id ? 'bright_data' : null, contact_status: pendingContact ? 'pending_contact' : 'complete' });
      if (onboardingError) { await admin.auth.admin.deleteUser(newUid); throw onboardingError; }
      const setup = import_job_id
        ? await admin.rpc('finalize_queued_broker_setup', {_user_id:newUid,_license:broker_license_number,_actor:actorId,_job:import_job_id})
        : await userClient.rpc('finalize_admin_broker_setup', {_user_id:newUid,_license:broker_license_number});
      if (setup.error) { await admin.auth.admin.deleteUser(newUid); throw setup.error; }
      if (registry?.valid) {
        const {error: re} = await admin.from('official_brokers_registry').upsert({license_number:broker_license_number,holder_name:registry.rawName,display_name:registry.holderName,registry_city:registry.city,source_url:registry.source,source_updated_at:registry.updatedAt});
        const {error: ve} = await admin.from('broker_license_verifications').upsert({user_id:newUid,license_number:broker_license_number,registry_holder_name:registry.rawName,account_name_before_verification:full_name,source_url:registry.source,source_updated_at:registry.updatedAt});
        const {error: pe} = await admin.from('profiles').update({full_name:registry.holderName,locked_broker_name:registry.holderName,city:registry.city || null,locked_broker_city:registry.city}).eq('id',newUid);
        if (re || ve || pe) { await admin.auth.admin.deleteUser(newUid); throw re ?? ve ?? pe; }
      }
    } else {
      const {error: roleError} = await admin.from('user_roles').insert({user_id:newUid,role:user_type});
      if (roleError) { await admin.auth.admin.deleteUser(newUid); throw roleError; }
      if (user_type === 'developer' && import_job_id) {
        const { error } = await admin.from('admin_broker_onboarding').insert({ user_id: newUid, created_by: actorId, import_source: 'developer_import', contact_status: normalizedPhone ? 'complete' : 'pending_contact' });
        if (error) { await admin.auth.admin.deleteUser(newUid); throw error; }
      }
    }

    // Audit
    await admin.from("audit_logs").insert({
      actor_id: actorId,

      action: "super_admin.create_user",
      target_table: "auth.users",
      target_id: newUid,
      details: { user_type, registry_verified: registry?.valid ?? false, license_required: user_type === 'broker', email, phone_e164: normalizedPhone, initial_balance_agorot, silent: true, ...(import_job_id ? { import_job_id } : {}), ...(import_source_url ? { import_source_url } : {}) },
    });

    return new Response(JSON.stringify({
      success: true,
      user_id: newUid,
      email,
      wa_status: "skipped",
      silent: true,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    // Database errors are plain objects (not Error instances); keep their real code/message instead of "unknown".
    const err = (e ?? {}) as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    const message = typeof err.message === 'string' && err.message ? err.message : String(e ?? 'unknown');
    const code = typeof err.code === 'string' ? err.code : null;
    const known = KNOWN_REJECTIONS[message];
    console.error("super-admin-create-user error", JSON.stringify({ code, message, details: err.details ?? null, hint: err.hint ?? null, permanent: Boolean(known) }));
    if (known) return new Response(JSON.stringify({ ok: false, error: message, code: message, detail: known.detail }), {
      status: known.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    return new Response(JSON.stringify({ error: message, code }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
