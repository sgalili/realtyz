// Resend-powered branded email sender for Realtyz brokers.
// - Reads the authenticated broker's `email_alias` from `profiles`
// - Builds From: "<Broker Name> <alias@realtyz.co.il>"
// - Renders a corporate Dark Blue + Gold property template
// - Sends via Resend connector gateway (RESEND_API_KEY + LOVABLE_API_KEY)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
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
      <div style="color:${GOLD};font-size:12px;letter-spacing:2px;font-weight:bold;">REALTYZ · ${escapeHtml(SENDER_DOMAIN.toUpperCase())}</div>
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
    <div style="background:#f3f4f6;padding:14px 24px;text-align:center;color:${MUTED};font-size:11px;">© ${new Date().getFullYear()} Realtyz · ${escapeHtml(SENDER_DOMAIN)}</div>
  </div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Resend אינו מחובר עדיין. חבר את Resend ב-Lovable Cloud → Connectors" }), {
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
    } = body as Record<string, any>;

    if (!recipient_email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient_email)) {
      return new Response(JSON.stringify({ error: "כתובת מייל לא תקינה" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await sb.from("profiles")
      .select("full_name, email, email_alias").eq("id", userId).maybeSingle();
    const alias = (profile?.email_alias || "").trim();
    if (!alias) {
      return new Response(JSON.stringify({ error: "טרם הוגדר prefix לאימייל המותג בפרופיל" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const brokerName = (profile?.full_name || "מתווך Realtyz").trim();
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

    const html = buildHtml({
      brokerName, leadName: recipient_name, subject, intro,
      listing, ctaQuestion: cta_question,
      signatureLine: `${alias}@${SENDER_DOMAIN}`,
    });

    const r = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [recipient_email],
        subject,
        html,
        reply_to: profile?.email || undefined,
      }),
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) {
      return new Response(JSON.stringify({ error: "Resend rejected", status: r.status, body: out }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ success: true, id: (out as any)?.id, from: fromAddress }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
