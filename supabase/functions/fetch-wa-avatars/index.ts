// fetch-wa-avatars
// ────────────────
// Contact profile pictures via the OFFICIAL Meta WhatsApp Business Cloud API.
//
// Important: the Meta Cloud API exposes a profile photo only for the BUSINESS
// number itself (GET /{phone-number-id}/whatsapp_business_profile). It does
// NOT expose customer/contact profile photos — Meta has no such endpoint, by
// design (privacy). There is therefore nothing to fetch per lead, and the UI
// falls back to initials/default avatars.
//
// This function is kept as a stable, non-throwing no-op so every legacy caller
// (CRM, Inbox, webhook) keeps working without surfacing error toasts. All
// Green API usage has been removed.
//
// POST body (all optional): { lead_ids?: string[], force?: boolean, limit?: number }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Always resolves successfully with zero updates — callers must treat this
  // as "nothing to do" and never raise a toast.
  return json({
    success: true,
    supported: false,
    provider: "WBA",
    scanned: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    reasons: [],
    results: [],
    reason:
      "ממשק WhatsApp Business הרשמי של Meta אינו מספק תמונות פרופיל של אנשי קשר — מוצגות ראשי תיבות במקום",
  });
});
