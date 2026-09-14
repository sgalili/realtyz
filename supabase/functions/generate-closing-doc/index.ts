/**
 * generate-closing-doc
 * --------------------
 * Generates the Hebrew, fully right-to-left brokerage services order form
 * (טופס הזמנת שירותי תיווך) for a lead using the active workspace broker's
 * verified details, the CRM contact record and the property row, uploads it to
 * the private `closing-docs` bucket and creates a `closing_documents` row in
 * status='draft' with a unique sign_token.
 *
 * Body: { lead_id, template_key: 'offer_letter'|'lease_agreement'|'tour_agreement',
 *         listing_id?, terms?, price_override?, tour_date? }
 *
 * Returns: { document_id, sign_token, pdf_path, sign_url }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";
import {
  buildBrokerageAgreementPdf,
  type AgreementProperty,
} from "../_shared/brokerageAgreementPdf.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z.object({
  lead_id: z.string().uuid(),
  // tour_agreement = pre-tour broker representation form signed before showings.
  template_key: z.enum(["offer_letter", "lease_agreement", "tour_agreement"]),
  listing_id: z.string().uuid().optional(),
  terms: z.string().max(4000).optional(),
  price_override: z.number().positive().optional(),
  tour_date: z.string().max(40).optional(),
  // Client ID number captured in the signature form; persisted onto the CRM
  // contact so future documents reuse it.
  identity_number: z.string().max(20).optional(),
});

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function token(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Strips an already-prefixed license value so we never print "מ.ר: מ.ר: 123". */
function cleanLicense(raw: string | null | undefined): string {
  const v = String(raw ?? "").trim();
  if (!v) return "—";
  return v.replace(/^מ\.?\s?ר\.?\s*:?\s*/, "").trim() || "—";
}

async function fetchLogo(url: string | null | undefined) {
  if (!url || !/^https:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").toLowerCase();
    const format = type.includes("jpeg") || type.includes("jpg") ? "JPEG" : type.includes("png") ? "PNG" : null;
    if (!format) return null;
    const data = new Uint8Array(await res.arrayBuffer());
    if (data.byteLength > 2_000_000) return null;
    return { data, format } as { data: Uint8Array; format: "PNG" | "JPEG" };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = userRes.user.id;
    const userEmail = userRes.user.email || "";

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { lead_id, template_key, listing_id, terms, price_override, tour_date } = parsed.data;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // ---------- Client (CRM contact) ----------
    const { data: lead, error: leadErr } = await admin
      .from("leads")
      .select("id, full_name, phone_number, email, city, address, identity_number, interest_tag, deal_type")
      .eq("id", lead_id)
      .maybeSingle();
    if (leadErr || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---------- Broker (active workspace owner, verified profile) ----------
    const { data: me } = await admin
      .from("profiles")
      .select("id, full_name, email, phone, broker_license_number, broker_byline, active_workspace_owner_id, workspace_owner_id")
      .eq("id", userId)
      .maybeSingle();
    const wsOwner = String((me as any)?.active_workspace_owner_id ?? (me as any)?.workspace_owner_id ?? userId);
    const { data: ownerProfile } = wsOwner && wsOwner !== userId
      ? await admin
        .from("profiles")
        .select("id, full_name, email, phone, broker_license_number, broker_byline")
        .eq("id", wsOwner)
        .maybeSingle()
      : { data: me as any };
    const brokerProfile = (ownerProfile ?? me) as any;

    const { data: brand } = await admin
      .from("white_label_settings")
      .select("agency_name, logo_url")
      .eq("user_id", wsOwner)
      .maybeSingle();

    // ---------- Property ----------
    let listing: any = {};
    if (listing_id) {
      const { data } = await admin
        .from("listings")
        .select("property_title, description, asking_price, address, city, rooms, floor, deal_type")
        .eq("id", listing_id)
        .maybeSingle();
      if (data) listing = data;
    }

    const dealType: "rent" | "sale" =
      (template_key === "lease_agreement" ? "rent" : null) ??
        (String(listing.deal_type ?? lead.deal_type ?? "").toLowerCase() === "sale" ? "sale" : "rent");

    const price = price_override ?? listing.asking_price ?? null;
    const propertyAddress = [listing.address, listing.city].filter(Boolean).join(", ") ||
      listing.property_title || lead.interest_tag || "—";

    const property: AgreementProperty = {
      ownerName: "—",
      address: propertyAddress,
      kind: "דירה",
      block: "—",
      parcel: "—",
      apartment: "—",
      floor: listing.floor != null ? String(listing.floor) : "—",
      rooms: listing.rooms != null ? String(listing.rooms) : "—",
      price,
    };

    const docId = crypto.randomUUID();
    const signToken = token();
    const leadName = lead.full_name || lead.phone_number || "לקוח";
    const brokerName = brokerProfile?.full_name || userEmail.split("@")[0] || "המתווך";

    const noteParts = [terms?.trim(), tour_date ? `סיור מתוכנן בנכס: ${tour_date}` : ""].filter(Boolean);

    const pdfBytes = await buildBrokerageAgreementPdf({
      dealType,
      documentId: docId,
      formNumber: String(Math.floor(Date.now() / 1000)).slice(-5),
      broker: {
        name: brokerName,
        license: cleanLicense(brokerProfile?.broker_license_number),
        phone: brokerProfile?.phone || "",
        email: brokerProfile?.email || userEmail,
        office: brand?.agency_name || brokerProfile?.broker_byline || "אנגלו סכסון הרצליה",
      },
      client: {
        name: leadName,
        identityNumber: identityNumber || "—",
        phone: lead.phone_number || "",
        address: [lead.address, lead.city].filter(Boolean).join(" ") || "—",
        email: lead.email || "—",
      },
      properties: [property],
      note: noteParts.join(" | ") || undefined,
      feeText: dealType === "rent"
        ? "חודש שכירות אחד"
        : "2% ממחיר העסקה",
      // The pre-tour form carries its own Hebrew name.
      titleOverride: template_key === "tour_agreement" ? "הסכם סיור בנכס" : undefined,
      logo: await fetchLogo(brand?.logo_url),
    });

    const path = `${userId}/${docId}.pdf`;
    const { error: upErr } = await admin.storage.from("closing-docs").upload(path, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upErr) throw upErr;

    const title = template_key === "tour_agreement"
      ? "הסכם סיור בנכס"
      : dealType === "rent"
        ? "הזמנת שירותי תיווך לשכירת נכס"
        : "הזמנת שירותי תיווך לרכישת נכס";

    const { error: insErr } = await admin.from("closing_documents").insert({
      id: docId,
      user_id: userId,
      lead_id,
      listing_id: listing_id ?? null,
      template_key,
      title: `${title} — ${leadName}`,
      status: "draft",
      pdf_path: path,
      sign_token: signToken,
      signer_name: leadName,
      fields: {
        lead_name: leadName,
        broker_name: brokerName,
        property_address: propertyAddress,
        price,
        deal_type: dealType,
        terms: terms ?? null,
        tour_date: tour_date ?? null,
      },
    });
    if (insErr) throw insErr;

    // Audit
    await admin.from("audit_logs").insert({
      actor_id: userId,
      actor_email: userEmail,
      action: "closing_document.generated",
      target_table: "closing_documents",
      target_id: docId,
      details: { template_key, lead_id, listing_id: listing_id ?? null, deal_type: dealType },
    });

    return new Response(
      JSON.stringify({
        document_id: docId,
        sign_token: signToken,
        pdf_path: path,
        sign_url: `/sign/${signToken}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e: any) {
    console.error("generate-closing-doc error", e);
    return new Response(JSON.stringify({ error: e?.message || "Generation failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
