import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizeEmail = (value: string) => String(value ?? "").trim().toLowerCase();
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const hashCode = async (email: string, code: string) => {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "realtyz-auth";
  const data = new TextEncoder().encode(`${email}:${code}:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const action = String(body.action ?? "send");
    const email = normalizeEmail(String(body.email ?? ""));
    if (!isEmail(email)) return json({ error: "כתובת אימייל לא תקינה" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    if (action === "send") {
      try { await admin.rpc("cleanup_expired_email_login_otps"); } catch { /* ignore */ }

      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, "0");
      const codeHash = await hashCode(email, code);
      const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();

      const { error: insertError } = await admin.from("email_login_otps").insert({
        email,
        code_hash: codeHash,
        expires_at: expiresAt,
      });
      if (insertError) throw insertError;

      // Login codes always go out from the platform mailbox info@realtyz.co.il.
      const html = `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;background:#ffffff;font-family:Arial,sans-serif;">
<div style="max-width:480px;margin:0 auto;padding:24px;text-align:right;">
<h1 style="font-size:22px;color:#0f172a;margin:0 0 16px;">קוד כניסה ל-Realtyz</h1>
<p style="font-size:15px;color:#475569;">הזן את הקוד הבא במסך הכניסה כדי להמשיך:</p>
<div style="background:#f1f5f9;border-radius:12px;padding:20px;margin:20px 0;text-align:center;font-size:40px;font-weight:900;letter-spacing:12px;font-family:monospace;color:#0f172a;" dir="ltr">${code}</div>
<p style="font-size:15px;color:#475569;">הקוד תקף ל-10 דקות. אם לא ביקשת קוד זה, אפשר להתעלם מהמייל.</p>
<p style="font-size:12px;color:#94a3b8;">בברכה, צוות Realtyz</p></div></body></html>`;
      const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY") ?? ""}`,
          "X-Connection-Api-Key": Deno.env.get("RESEND_API_KEY") ?? "",
        },
        body: JSON.stringify({
          from: "Realtyz <info@realtyz.co.il>",
          to: [email],
          subject: `קוד הכניסה שלך ל-Realtyz: ${code}`,
          html,
          text: `קוד הכניסה שלך ל-Realtyz: ${code} (תקף ל-10 דקות)`,
        }),
      });
      if (!res.ok) {
        console.error("resend otp failed", res.status, await res.text());
        return json({ error: "שליחת קוד נכשלה" }, 502);
      }

      return json({ success: true });
    }

    if (action === "verify") {
      const code = String(body.code ?? "").replace(/\D/g, "");
      if (!/^\d{4}$/.test(code)) return json({ error: "קוד אימות לא תקין" }, 400);

      const { data: otpRow, error: otpError } = await admin
        .from("email_login_otps")
        .select("id, code_hash, attempts, expires_at, consumed_at")
        .eq("email", email)
        .is("consumed_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (otpError) throw otpError;
      if (!otpRow || otpRow.attempts >= MAX_ATTEMPTS) return json({ error: "הקוד פג או לא נמצא" }, 400);

      const expectedHash = await hashCode(email, code);
      if (expectedHash !== otpRow.code_hash) {
        await admin.from("email_login_otps").update({ attempts: otpRow.attempts + 1 }).eq("id", otpRow.id);
        return json({ error: "קוד שגוי" }, 400);
      }

      await admin.from("email_login_otps").update({ consumed_at: new Date().toISOString() }).eq("id", otpRow.id);

      // Ensure the user exists (create on first login), then issue a magic link token to sign them in.
      try {
        const { error: createError } = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { provider: "email_otp" },
        });
        if (createError && !/already|registered|exists/i.test(createError.message)) throw createError;
      } catch (e) {
        console.warn("createUser non-fatal", e);
      }

      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      if (linkError) throw linkError;

      return json({
        success: true,
        email,
        token_hash: linkData.properties?.hashed_token,
      });
    }

    return json({ error: "פעולה לא נתמכת" }, 400);
  } catch (error) {
    console.error("email-auth error", error);
    return json({ error: error instanceof Error ? error.message : "שגיאת שרת" }, 500);
  }
});
