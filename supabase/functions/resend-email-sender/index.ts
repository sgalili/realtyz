// Resend-powered branded email sender for TORAFF brokers.
// - Reads the authenticated broker's `email_alias` from `profiles`
// - Builds From: "<Broker Name> <alias@realtyz.co.il>"
// - Renders a corporate Dark Blue + Gold property template
// - Sends via Resend connector gateway (RESEND_API_KEY + LOVABLE_API_KEY)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const RESEND_URL = "https://connector-gateway.lovable.dev/resend/emails";
const SENDER_DOMAIN = "realtyz.co.il";

function escapeHtml(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

function buildHtml(opts: {
  brokerName: string;
  leadName: string;
  subject: string;
  intro: string;
  listing?: {
    title?: string | null;
    city?: string | null;
    price?: number | null;
    description?: string | null;
    rooms?: number | null;
    sqm?: number | null;
  } | null;
  ctaQuestion: string;
  signatureLine: string;
}) {
  const NAVY = "#0B2447";
  const NAVY_DEEP = "#071A36";
  const GOLD = "#C9A24C";
  const TEXT = "#1F2937";
  const MUTED = "#6B7280";
  const l = opts.listing ?? null;
  const priceFmt = l?.price ? `₪${Number(l.price).toLocaleString("he-IL")}` : "";
  const meta = [
    l?.rooms ? `${l.rooms} חד׳` : "",
    l?.sqm ? `${l.sqm} מ״ר` : "",
    l?.city || "",
  ].filter(Boolean).join(" · ");
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(opts.subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:${TEXT};">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
    <div style="background:${NAVY};padding:28px 24px;text-align:right;border-bottom:4px solid ${GOLD};">
      <div style="color:${GOLD};font-size:12px;letter-spacing:2px;font-weight:bold;">TORAFF · ${escapeHtml(SENDER_DOMAIN.toUpperCase())}</div>
      <h1 style="color:#ffffff;font-size:22px;margin:6px 0 0 0;font-weight:700;">${escapeHtml(opts.subject)}</h1>
    </div>
    <div style="padding:24px;text-align:right;line-height:1.7;font-size:15px;">
      <p style="margin:0 0 14px 0;">שלום ${escapeHtml(opts.leadName || "")},</p>
      <p style="margin:0 0 18px 0;">${escapeHtml(opts.intro)}</p>
      ${l ? `
      <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;background:#fafafa;">
        <div style="color:${NAVY_DEEP};font-weight:700;font-size:17px;">${escapeHtml(l.title || "נכס מומלץ")}</div>
        <div style="color:${MUTED};font-size:13px;margin-top:4px;">${escapeHtml(meta)}</div>
        ${priceFmt ? `<div style="color:${GOLD};font-weight:700;font-size:18px;margin-top:10px;">${priceFmt}</div>` : ""}
        ${l.description ? `<p style="margin:12px 0 0 0;color:${TEXT};font-size:14px;">${escapeHtml(String(l.description).slice(0, 380))}</p>` : ""}
      </div>` : ""}
      <div style="background:${NAVY};color:#ffffff;border-radius:10px;padding:18px;margin-top:22px;text-align:right;">
        <div style="color:${GOLD};font-size:12px;font-weight:bold;letter-spacing:1px;">שאלה אחת בלבד</div>
        <div style="font-size:16px;margin-top:6px;font-weight:600;">${escapeHtml(opts.ctaQuestion)}</div>
      </div>
      <p style="margin:22px 0 0 0;color:${MUTED};font-size:13px;">בברכה,<br><span style="color:${NAVY_DEEP};font-weight:700;">${escapeHtml(opts.brokerName)}</span><br>${escapeHtml(opts.signatureLine)}</p>
    </div>
    <div style="background:#f3f4f6;padding:14px 24px;text-align:center;color:${MUTED};font-size:11px;">© ${new Date().getFullYear()} TORAFF · ${escapeHtml(SENDER_DOMAIN)}</div>
  </div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "תיבת הדואר של realtyz.co.il אינה מוגדרת" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authErr } = await sb.auth.getClaims(token);
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const {
      recipient_email,
      recipient_name = "",
      subject = "הצעת ערך חדשה עבורך",
      intro = "מצורפים הפרטים העדכניים שביקשת.",
      cta_question = "מתי נוח לך לקפוץ לראות?",
      listing_id,
      body_text,
    } = body as Record<string, any>;

    if (!recipient_email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient_email)) {
      return new Response(JSON.stringify({ error: "כתובת מייל לא תקינה" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // One mailbox per workspace: resolve the active workspace owner.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: ownerId } = await sb.rpc("current_workspace_owner");
    const wsOwner = (ownerId as string) || userId;
    const { data: profile } = await admin.from("profiles")
      .select("full_name, email, email_alias, email_provider").eq("id", wsOwner).maybeSingle();

    // Gmail first: when the workspace has Gmail connected, send through it.
    const { data: gmailRows } = await admin.from("social_connections")
      .select("id, credentials").in("platform", ["gmail", "google"])
      .eq("created_by", wsOwner).eq("is_connected", true).limit(1);
    const gmailRow = gmailRows?.[0] as any;
    const gCreds = (gmailRow?.credentials ?? {}) as Record<string, any>;
    const gToken = gCreds?.manual?.access_token as string | undefined;
    const gFrom = (gCreds?.verified_identity?.email ?? gCreds?.account_name ?? "") as string;

    const alias = (profile?.email_alias || "").trim();
    const preferRealtyz = (profile as any)?.email_provider === "realtyz" && !!alias;
    if (!alias && !(gToken && gFrom)) {
      return new Response(JSON.stringify({ error: "טרם הוגדרה תיבת מייל למרחב העבודה (Gmail או כתובת @realtyz.co.il)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const brokerName = (profile?.full_name || "מתווך TORAFF").trim();
    const fromAddress = `${brokerName} <${alias}@${SENDER_DOMAIN}>`;

    let listing: any = null;
    if (listing_id) {
      const { data: l } = await sb.from("listings")
        .select("property_title, description, city, asking_price, features")
        .eq("id", listing_id).maybeSingle();
      if (l) {
        const f = (l.features ?? {}) as Record<string, any>;
        listing = {
          title: l.property_title, city: l.city, price: l.asking_price,
          description: l.description, rooms: f.rooms ?? null, sqm: f.sqm ?? null,
        };
      }
    }

    const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
    const customBody = typeof body_text === "string" && body_text.trim() ? body_text.trim().slice(0, 20000) : null;
    const html = customBody
      ? `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;white-space:pre-wrap">${escapeHtml(customBody)}</div>`
      : buildHtml({
      brokerName, leadName: recipient_name, subject, intro,
      listing, ctaQuestion: cta_question,
      signatureLine: `${alias}@${SENDER_DOMAIN}`,
    });

    const logSent = (row: Record<string, unknown>) =>
      admin.from("outbound_emails_log").insert({
        workspace_owner_id: wsOwner, sent_by: userId, to_email: recipient_email,
        subject, body_text: customBody ?? intro, ...row,
      }).then(({ error }) => { if (error) console.error("outbound log failed", error); });

    if (gToken && gFrom && !preferRealtyz) {
      const b64 = (str: string) => btoa(Array.from(new TextEncoder().encode(str), (b) => String.fromCharCode(b)).join(""));
      const hdr = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);
      const mime = [
        `From: ${hdr(brokerName)} <${gFrom}>`, `To: ${recipient_email}`, `Subject: ${hdr(subject)}`,
        "MIME-Version: 1.0", 'Content-Type: text/html; charset="UTF-8"', "", html,
      ].join("\r\n");
      const raw = b64(mime).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const g = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${gToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      const gOut = await g.json().catch(() => ({}));
      if (g.ok) {
        await logSent({ from_email: gFrom, provider: "gmail", provider_message_id: (gOut as any)?.id ?? null });
        return new Response(JSON.stringify({ success: true, provider: "gmail", id: (gOut as any)?.id, from: gFrom }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("gmail send failed", g.status, gOut);
      if (!alias) {
        return new Response(JSON.stringify({ error: "שליחה דרך Gmail נכשלה - יש לחבר מחדש", status: g.status, details: gOut }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const r = await fetch(RESEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY") ?? ""}`, "X-Connection-Api-Key": RESEND_API_KEY },
      body: JSON.stringify({
        from: fromAddress,
        to: [recipient_email],
        subject,
        html,
        // Replies go back to the workspace mailbox so they land in the CRM inbox.
        reply_to: `${alias}@${SENDER_DOMAIN}`,
      }),
    });
    const out = await r.json().catch(() => ({}));
    await logSent({
      from_email: `${alias}@${SENDER_DOMAIN}`, provider: "resend",
      provider_message_id: (out as any)?.id ?? null,
      status: r.ok ? "sent" : "failed", error: r.ok ? null : JSON.stringify(out).slice(0, 500),
    });
    if (!r.ok) {
      return new Response(JSON.stringify({ error: "Resend rejected", status: r.status, body: out }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ success: true, provider: "resend", id: (out as any)?.id, from: fromAddress }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
