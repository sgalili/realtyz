// Verifies the 019 SMS gateway for the CALLER'S ACTIVE WORKSPACE.
//
// Credentials are resolved SERVER-SIDE from public.workspace_sms_settings
// (falling back to the platform row), so the client never has to send the API
// token — the masked "(שמור)" placeholder in the UI is irrelevant here.
//
// mode: "balance" (default) reads the account balance; "send" additionally
// dispatches a real test SMS to the workspace's approved sender number.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveSms019Config, sendSms019, sms019Balance, toLocalIL } from "../_shared/sms019.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ success: false, error: "נדרשת התחברות" }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    const caller = userData?.user;
    if (userErr || !caller) return json({ success: false, error: "נדרשת התחברות" }, 401);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const mode = String((body as any).mode ?? "balance") === "send" ? "send" : "balance";

    // Active workspace of the caller, verified against their memberships so a
    // workspace's 019 account is never testable from another workspace.
    let workspaceOwnerId: string | null = null;
    const { data: prof } = await admin
      .from("profiles")
      .select("active_workspace_owner_id")
      .eq("id", caller.id)
      .maybeSingle();
    const requested = String((body as any).workspace_owner_id ?? "").trim() ||
      String((prof as any)?.active_workspace_owner_id ?? "").trim() || caller.id;
    if (requested === caller.id) {
      workspaceOwnerId = caller.id;
    } else {
      const { data: member } = await admin
        .from("workspace_memberships")
        .select("user_id")
        .eq("workspace_owner_id", requested)
        .eq("user_id", caller.id)
        .maybeSingle();
      workspaceOwnerId = member ? requested : caller.id;
    }

    const cfg = await resolveSms019Config(admin as any, workspaceOwnerId);
    if (!cfg) {
      return json({
        success: false,
        error: "לא נמצאו פרטי 019 למרחב העבודה. הזינו שם משתמש, טוקן ומספר שולח מאושר ושמרו.",
      });
    }

    const bal = await sms019Balance(cfg);
    if (!bal.ok) {
      console.log("[test-sms-connection] balance failed", cfg.scope, bal.error);
      return json({ success: false, scope: cfg.scope, username: cfg.username, error: bal.error });
    }

    if (mode !== "send") {
      return json({
        success: true,
        scope: cfg.scope,
        username: cfg.username,
        sender: cfg.sender || null,
        credit: bal.balance ?? "0",
      });
    }

    const target = String((body as any).recipient ?? "").trim() || cfg.sender;
    if (!toLocalIL(target)) {
      return json({
        success: false,
        scope: cfg.scope,
        credit: bal.balance ?? "0",
        error: "מספר השולח אינו מספר נייד ישראלי תקין, ולכן לא ניתן לשלוח אליו הודעת בדיקה.",
      });
    }
    const sent = await sendSms019(
      admin as any,
      target,
      "Realtyz: הודעת בדיקה משער ה-SMS של 019. החיבור פעיל.",
      workspaceOwnerId,
    );
    console.log("[test-sms-connection] test send", cfg.scope, sent.ok, sent.error ?? "");
    return json({
      success: sent.ok,
      scope: cfg.scope,
      username: cfg.username,
      sender: cfg.sender || null,
      credit: bal.balance ?? "0",
      sent_to: target,
      message_id: sent.message_id ?? null,
      error: sent.ok ? undefined : sent.error,
    });
  } catch (err) {
    console.error("[test-sms-connection] fatal", err);
    return json({ success: false, error: err instanceof Error ? err.message : "שגיאה" }, 500);
  }
});
