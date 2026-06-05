// preview-master-auth
// ──────────────────────
// Allows sign-in/sign-up using a master OTP (default "9321") WITHOUT sending
// anything to email/SMS/WhatsApp. ONLY accepts requests originating from a
// Lovable preview host (id-preview--*.lovable.app, *.lovable.dev or *.lovableproject.com).
//
// Input: { identifier: string, kind: 'email' | 'phone', code: string }
// Output: { success, email, token_hash }  → client calls verifyOtp({type:'email'})
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MASTER_OTP = Deno.env.get("PREVIEW_MASTER_OTP") ?? "9321";

const isPreviewOrigin = (req: Request): boolean => {
  const origin = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
  try {
    const host = new URL(origin).hostname;
    return (
      host.startsWith("id-preview--") ||
      host.endsWith(".lovable.dev") ||
      host.endsWith(".lovableproject.com") ||
      host.endsWith(".lovable.app") ||
      host === "realtyz.kalpiz.co.il" ||
      host === "realtyz.udiman.com"
    );
  } catch {
    return false;
  }
};

const normalizeIsraeliPhone = (value: string): string | null => {
  const digits = value.replace(/\D/g, "");
  if (/^05\d{8}$/.test(digits)) return `972${digits.slice(1)}`;
  if (/^9725\d{8}$/.test(digits)) return digits;
  return null;
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!isPreviewOrigin(req)) {
    return json({ error: "preview origin required" }, 403);
  }

  try {
    const { identifier, kind, code } = await req.json();
    if (String(code ?? "") !== MASTER_OTP) return json({ error: "invalid master code" }, 401);
    if (!identifier || !kind) return json({ error: "missing identifier/kind" }, 400);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    let targetEmail = "";
    let targetPhone: string | null = null;
    if (kind === "email") {
      targetEmail = String(identifier).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) return json({ error: "bad email" }, 400);
    } else if (kind === "phone") {
      const phone = normalizeIsraeliPhone(String(identifier));
      if (!phone) return json({ error: "bad phone" }, 400);
      targetPhone = phone;
      // Super-admin-created accounts are email-first. Prefer the explicit
      // create-user audit mapping before falling back to WA-only synthetic users.
      const { data: auditRows } = await admin
        .from("audit_logs")
        .select("details")
        .eq("action", "super_admin.create_user")
        .eq("details->>phone_e164", phone)
        .order("created_at", { ascending: false })
        .limit(1);
      const auditedEmail = (auditRows?.[0]?.details as { email?: string } | undefined)?.email;
      if (auditedEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(auditedEmail)) {
        targetEmail = auditedEmail.toLowerCase();
      }

      // Look up existing user by phone next.
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const match = list?.users?.find((u) => {
        const userPhone = String(u.phone ?? "").replace(/\D/g, "");
        const metaPhone = String((u.user_metadata as { phone_number?: string } | null)?.phone_number ?? "").replace(/\D/g, "");
        return userPhone === phone || metaPhone === phone;
      });
      targetEmail = targetEmail || match?.email || `${phone}@whatsapp.realtyz.local`;
    } else {
      return json({ error: "bad kind" }, 400);
    }

    // Ensure the user exists (idempotent)
    const { error: createErr } = await admin.auth.admin.createUser({
      email: targetEmail,
      ...(targetPhone ? { phone: `+${targetPhone}`, phone_confirm: true } : {}),
      email_confirm: true,
      user_metadata: { provider: "preview_master_otp", ...(targetPhone ? { phone_number: targetPhone } : {}) },
    });
    if (createErr && !/already|registered|exists/i.test(createErr.message)) {
      console.warn("preview-master-auth createUser", createErr.message);
    }

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: targetEmail,
    });
    if (linkErr) throw linkErr;

    return json({
      success: true,
      email: targetEmail,
      token_hash: linkData.properties?.hashed_token,
    });
  } catch (e) {
    console.error("preview-master-auth error", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
