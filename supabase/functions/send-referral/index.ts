import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  partner_broker_id: z.string().uuid().optional(),
  partner_name: z.string().min(1).max(120).optional(),
  partner_email: z.string().email().max(255).optional().nullable(),
  partner_phone: z.string().max(40).optional().nullable(),
  lead_id: z.string().uuid().optional().nullable(),
  listing_id: z.string().uuid().optional().nullable(),
  subject_kind: z.enum(["lead", "listing", "other"]),
  subject_label: z.string().min(1).max(280),
  channel: z.enum(["whatsapp", "email", "manual"]).default("whatsapp"),
  message_body: z.string().min(1).max(4000),
  commission_split_pct: z.number().min(0).max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  return digits;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const input = parsed.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // Resolve partner contact: from partner_broker_id if provided, else from inline fields
    let partnerName = input.partner_name ?? "";
    let partnerEmail = input.partner_email ?? null;
    let partnerPhone = input.partner_phone ?? null;

    if (input.partner_broker_id) {
      const { data: pb } = await supabase
        .from("partner_brokers")
        .select("full_name, email, phone")
        .eq("id", input.partner_broker_id)
        .maybeSingle();
      if (pb) {
        partnerName = partnerName || pb.full_name;
        partnerEmail = partnerEmail || pb.email;
        partnerPhone = partnerPhone || pb.phone;
      }
    }

    if (!partnerName) {
      return new Response(JSON.stringify({ error: "partner_name required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try linking the partner to an internal user (so they can see incoming referrals)
    let recipientUserId: string | null = null;
    if (partnerEmail) {
      const { data: link } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", partnerEmail)
        .maybeSingle();
      if (link?.id) recipientUserId = link.id;
    }

    // Build deep-link for the chosen channel
    const normPhone = normalizePhone(partnerPhone);
    const encoded = encodeURIComponent(input.message_body);
    let waLink: string | null = null;
    let mailtoLink: string | null = null;
    if (input.channel === "whatsapp" && normPhone) {
      waLink = `https://wa.me/${normPhone}?text=${encoded}`;
    }
    if (input.channel === "email" && partnerEmail) {
      const subject = encodeURIComponent(`הפניה מקצועית: ${input.subject_label}`);
      mailtoLink = `mailto:${partnerEmail}?subject=${subject}&body=${encoded}`;
    }

    const deliveryStatus =
      input.channel === "manual"
        ? "manual"
        : (input.channel === "whatsapp" && waLink) || (input.channel === "email" && mailtoLink)
          ? "sent"
          : "failed";

    const { data: inserted, error: insertErr } = await supabase
      .from("broker_referrals")
      .insert({
        sender_user_id: userId,
        recipient_user_id: recipientUserId,
        partner_broker_id: input.partner_broker_id ?? null,
        partner_name: partnerName,
        partner_email: partnerEmail,
        partner_phone: partnerPhone,
        lead_id: input.lead_id ?? null,
        listing_id: input.listing_id ?? null,
        subject_kind: input.subject_kind,
        subject_label: input.subject_label,
        direction: "outbound",
        status: "pending",
        channel: input.channel,
        message_body: input.message_body,
        commission_split_pct: input.commission_split_pct ?? null,
        delivery_status: deliveryStatus,
        delivery_meta: { wa_link: waLink, mailto_link: mailtoLink },
        notes: input.notes ?? null,
      })
      .select("*")
      .single();

    if (insertErr) {
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        referral: inserted,
        wa_link: waLink,
        mailto_link: mailtoLink,
        delivery_status: deliveryStatus,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
