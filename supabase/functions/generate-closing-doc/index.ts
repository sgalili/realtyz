/**
 * generate-closing-doc
 * --------------------
 * Generates a pre-filled PDF (offer letter or lease agreement) for a prospect
 * using their Deal Room data + (optionally) a listing, uploads it to the
 * private `closing-docs` bucket, and creates a `closing_documents` row in
 * status='draft' with a unique sign_token.
 *
 * Body: { lead_id: uuid, template_key: 'offer_letter'|'lease_agreement',
 *         listing_id?: uuid, terms?: string, price_override?: number }
 *
 * Returns: { document_id, sign_token, pdf_path, sign_url }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";
// jsPDF works in Deno via esm.sh
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z.object({
  lead_id: z.string().uuid(),
  template_key: z.enum(["offer_letter", "lease_agreement"]),
  listing_id: z.string().uuid().optional(),
  terms: z.string().max(4000).optional(),
  price_override: z.number().positive().optional(),
});

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function token(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function buildPdf(opts: {
  template: "offer_letter" | "lease_agreement";
  prospectName: string;
  agentName: string;
  agentEmail: string;
  propertyTitle: string;
  propertyDescription: string;
  price: number | null;
  terms: string;
  date: string;
  documentId: string;
}): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const w = doc.internal.pageSize.getWidth();
  const margin = 56;
  let y = margin;

  // Header
  doc.setFont("helvetica", "bold").setFontSize(20);
  doc.text(opts.template === "offer_letter" ? "Offer Letter" : "Residential Lease Agreement", margin, y);
  y += 12;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(120);
  doc.text(`Document ID: ${opts.documentId}`, margin, y + 12);
  doc.text(`Date: ${opts.date}`, w - margin, y + 12, { align: "right" });
  y += 36;
  doc.setDrawColor(220).line(margin, y, w - margin, y);
  y += 24;

  // Parties
  doc.setTextColor(0).setFont("helvetica", "bold").setFontSize(11);
  doc.text("PARTIES", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal").setFontSize(11);
  doc.text(`Prospective ${opts.template === "lease_agreement" ? "Tenant" : "Buyer"}: ${opts.prospectName}`, margin, y);
  y += 16;
  doc.text(`Listing Agent: ${opts.agentName}  (${opts.agentEmail})`, margin, y);
  y += 28;

  // Property
  doc.setFont("helvetica", "bold").text("PROPERTY", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.text(opts.propertyTitle, margin, y);
  y += 14;
  if (opts.propertyDescription) {
    const lines = doc.splitTextToSize(opts.propertyDescription, w - margin * 2);
    doc.setFontSize(10).setTextColor(80);
    doc.text(lines, margin, y);
    y += lines.length * 12 + 6;
    doc.setFontSize(11).setTextColor(0);
  }
  y += 8;

  // Financial
  doc.setFont("helvetica", "bold").text(opts.template === "offer_letter" ? "OFFER" : "RENT TERMS", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  if (opts.template === "offer_letter") {
    doc.text(`Offer price: ${fmtMoney(opts.price)}`, margin, y);
    y += 16;
    doc.text(`Earnest deposit: ${fmtMoney(opts.price ? opts.price * 0.01 : null)}`, margin, y);
    y += 16;
    doc.text(`Closing target: 45 days from acceptance`, margin, y);
  } else {
    doc.text(`Monthly rent: ${fmtMoney(opts.price ? Math.round(opts.price / 200) : null)}`, margin, y);
    y += 16;
    doc.text(`Security deposit: equal to one month's rent`, margin, y);
    y += 16;
    doc.text(`Lease term: 12 months`, margin, y);
  }
  y += 28;

  // Terms
  doc.setFont("helvetica", "bold").text("TERMS & CONDITIONS", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal").setFontSize(10);
  const terms = opts.terms || (opts.template === "offer_letter"
    ? "This non-binding letter of intent expresses the Buyer's interest in the Property under the terms above. Final terms are subject to a formal purchase agreement, financing approval, and standard inspections."
    : "Tenant agrees to pay rent on the 1st of each month. Property to be used solely as a private residence. Subletting prohibited without written consent of the Landlord.");
  const termLines = doc.splitTextToSize(terms, w - margin * 2);
  doc.text(termLines, margin, y);
  y += termLines.length * 12 + 28;

  // Signature block
  doc.setFontSize(11).setFont("helvetica", "bold").text("SIGNATURES", margin, y);
  y += 22;
  doc.setFont("helvetica", "normal").setFontSize(10);
  // Two signature lines
  const colW = (w - margin * 2 - 24) / 2;
  doc.setDrawColor(0).line(margin, y + 30, margin + colW, y + 30);
  doc.line(margin + colW + 24, y + 30, w - margin, y + 30);
  doc.setTextColor(120);
  doc.text(opts.prospectName, margin, y + 44);
  doc.text("Signed via Realtyz secure link", margin, y + 56);
  doc.text(opts.agentName, margin + colW + 24, y + 44);
  doc.text(opts.agentEmail, margin + colW + 24, y + 56);

  // Footer
  doc.setFontSize(8).setTextColor(150);
  doc.text("Generated by Realtyz Digital Closing Room — secure e-signature", margin, doc.internal.pageSize.getHeight() - 24);

  const ab = doc.output("arraybuffer");
  return new Uint8Array(ab);
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
    const userEmail = userRes.user.email || "agent@realtyz";

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { lead_id, template_key, listing_id, terms, price_override } = parsed.data;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: lead, error: leadErr } = await admin
      .from("leads")
      .select("id, full_name, phone_number, city, interest_tag")
      .eq("id", lead_id)
      .maybeSingle();
    if (leadErr || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let listing: { property_title?: string; description?: string; asking_price?: number } = {};
    if (listing_id) {
      const { data } = await admin
        .from("listings")
        .select("property_title, description, asking_price")
        .eq("id", listing_id)
        .maybeSingle();
      if (data) listing = data as any;
    }

    const docId = crypto.randomUUID();
    const signToken = token();
    const prospectName = lead.full_name || lead.phone_number || "Prospect";
    const propertyTitle = listing.property_title || lead.interest_tag || "Subject Property";
    const propertyDescription = listing.description || "";
    const price = price_override ?? listing.asking_price ?? null;

    const pdfBytes = buildPdf({
      template: template_key,
      prospectName,
      agentName: userEmail.split("@")[0],
      agentEmail: userEmail,
      propertyTitle,
      propertyDescription,
      price,
      terms: terms ?? "",
      date: new Date().toISOString().slice(0, 10),
      documentId: docId,
    });

    const path = `${userId}/${docId}.pdf`;
    const { error: upErr } = await admin.storage.from("closing-docs").upload(path, pdfBytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upErr) throw upErr;

    const title = template_key === "offer_letter" ? "Offer Letter" : "Lease Agreement";

    const { error: insErr } = await admin.from("closing_documents").insert({
      id: docId,
      user_id: userId,
      lead_id,
      listing_id: listing_id ?? null,
      template_key,
      title: `${title} — ${prospectName}`,
      status: "draft",
      pdf_path: path,
      sign_token: signToken,
      signer_name: prospectName,
      fields: {
        prospect_name: prospectName,
        property_title: propertyTitle,
        price,
        terms: terms ?? null,
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
      details: { template_key, lead_id, listing_id: listing_id ?? null },
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
