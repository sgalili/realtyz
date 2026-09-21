// Lead wall for the public listings board.
//
// Flow (strict, auditable — this is the commission paper trail):
//   1. `register` — a visitor who taps favourite / full details / navigation /
//      contact leaves name + WhatsApp number. A CRM contact is
//      created inside the listing's workspace and an interest record is opened.
//   2. `rita`    — the visitor talks to Rita. The FIRST real turn marks the
//      record as engaged and unlocks the full details.
//   3. `details` — exact address and contact details, returned ONLY for an
//      unlocked record.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { normalizePhone } from "../_shared/leadIntake.ts";
import { toPublicCard } from "../_shared/publicMask.ts";

const OFFICIAL_WA = "9725379832";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const str = (v: unknown, max = 120) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const backendUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!backendUrl || !serviceKey) throw new Error("missing backend configuration");
    const admin = createClient(backendUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const action = str(body?.action, 20) || "register";

    // ---------------------------------------------------------- register
    if (action === "register") {
      const listingId = str(body?.listing_id, 60);
      const name = str(body?.name, 80);
      const phone = normalizePhone(str(body?.phone, 30));
      const intent = str(body?.intent, 30) || "details";
      const comment = str(body?.comment, 1000);
      if (!listingId || !name || !phone) {
        return json({ error: "שם וטלפון תקין הם שדות חובה" }, 400);
      }

      const { data: listing, error: listingError } = await admin
        .from("listings")
        .select("id, city, neighborhood, deal_type, asking_price, workspace_owner_id, user_id, is_published, affiliate_enabled")
        .eq("id", listingId)
        .maybeSingle();
      if (listingError) throw listingError;
      if (!listing || !listing.affiliate_enabled) {
        return json({ error: "הנכס אינו זמין" }, 404);
      }
      const ownerId = listing.workspace_owner_id ?? listing.user_id;

      // CRM contact inside the listing's workspace (never a global contact).
      const { data: existing } = await admin
        .from("leads")
        .select("id, full_name")
        .eq("workspace_owner_id", ownerId)
        .eq("phone_number", phone)
        .maybeSingle();

      let leadId = existing?.id as string | undefined;
      if (leadId) {
        await admin
          .from("leads")
          .update({
            full_name: existing?.full_name || name,
            last_interaction_at: new Date().toISOString(),
          })
          .eq("id", leadId);
      } else {
        const { data: inserted, error: insertError } = await admin
          .from("leads")
          .insert({
            workspace_owner_id: ownerId,
            phone_number: phone,
            full_name: name,
            city: listing.city ?? null,
            deal_type: listing.deal_type === "rent" ? "rent" : "sale",
            lead_stage: "new",
            status: "new",
            source: "public_listings_board",
            last_interaction_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (insertError) throw insertError;
        leadId = inserted.id as string;
      }

      const accessToken = crypto.randomUUID().replace(/-/g, "");
      const { error: interestError } = await admin.from("public_listing_interest").insert({
        listing_id: listing.id,
        lead_id: leadId,
        workspace_owner_id: ownerId,
        visitor_name: name,
        visitor_phone: phone,
        callback_window: null,
        access_token: accessToken,
        intent,
      });
      if (interestError) throw interestError;

      await admin.from("interaction_activity_log").insert({
        user_id: ownerId,
        workspace_owner_id: ownerId,
        thread_key: `public-board:${listing.id}:${phone}`,
        platform: "web",
        action_type: "lead_gate_registration",
        actor_type: "system",
        content: `מתעניין חדש מהלוח הציבורי: ${name} · ${phone}`,
        metadata: { listing_id: listing.id, lead_id: leadId, intent, comment: comment || null },
      });

      return json({
        token: accessToken,
        unlocked: false,
        lead_id: leadId,
        greeting: `היי ${name}, אני ריטה. ספרי לי מה חשוב לך בנכס הזה ואשלח לך מיד את כל הפרטים המלאים.`,
      });
    }

    // ---------------------------------------------------------- callback
    if (action === "callback") {
      const listingId = str(body?.listing_id, 60);
      const name = str(body?.name, 80);
      const phone = normalizePhone(str(body?.phone, 30));
      if (!listingId || !name || !phone) return json({ error: "שם וטלפון תקין הם שדות חובה" }, 400);
      const { data: listing } = await admin.from("listings").select("id, city, deal_type, workspace_owner_id, user_id, contact_options, affiliate_enabled, is_published").eq("id", listingId).maybeSingle();
      if (!listing || !(listing.affiliate_enabled || listing.is_published) || listing.contact_options?.phone !== true) return json({ error: "אפשרות השיחה אינה זמינה" }, 404);
      const ownerId = listing.workspace_owner_id ?? listing.user_id;
      const { data: existing } = await admin.from("leads").select("id").eq("workspace_owner_id", ownerId).eq("phone_number", phone).maybeSingle();
      let leadId = existing?.id as string | undefined;
      if (!leadId) {
        const { data: inserted, error: insertError } = await admin.from("leads").insert({ workspace_owner_id: ownerId, phone_number: phone, full_name: name, city: listing.city ?? null, deal_type: listing.deal_type === "rent" ? "rent" : "sale", lead_stage: "new", status: "new", source: "public_phone_callback", last_interaction_at: new Date().toISOString() }).select("id").single();
        if (insertError) throw insertError;
        leadId = inserted.id as string;
      }
      const questions = Array.isArray(listing.contact_options?.questions) ? listing.contact_options.questions.filter((q: unknown) => typeof q === "string").slice(0, 6) : [];
      const instructions = ["השיחה מתייחסת אך ורק לנכס שנשלח אליך.", "שאל לפחות שלוש שאלות סינון לפני סיום השיחה.", ...questions.map((q: string, i: number) => `שאלה ${i + 1}: ${q}`)].join("\n");
      const response = await fetch(`${backendUrl}/functions/v1/vapi-outbound-call`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` }, body: JSON.stringify({ phone_number: phone, lead_id: leadId, listing_id: listing.id, instructions, workspace_owner_id: ownerId }) });
      const callData = await response.json().catch(() => ({}));
      if (!response.ok || callData?.error) return json({ error: "שירות השיחות אינו זמין כרגע" }, 503);
      await admin.from("public_listing_interest").insert({ listing_id: listing.id, lead_id: leadId, workspace_owner_id: ownerId, visitor_name: name, visitor_phone: phone, access_token: crypto.randomUUID().replace(/-/g, ""), intent: "phone" });
      return json({ success: true });
    }

    // ------------------------------------------------------------- rita
    if (action === "rita") {
      const token = str(body?.token, 80);
      const message = str(body?.message, 1200);
      if (!token || !message) return json({ error: "invalid request" }, 400);

      const { data: interest } = await admin
        .from("public_listing_interest")
        .select("id, lead_id, listing_id, workspace_owner_id, rita_engaged_at")
        .eq("access_token", token)
        .maybeSingle();
      if (!interest) return json({ error: "invalid token" }, 404);

      const now = new Date().toISOString();
      await admin
        .from("public_listing_interest")
        .update({
          rita_engaged_at: interest.rita_engaged_at ?? now,
          unlocked_at: now,
        })
        .eq("id", interest.id);

      let reply = "תודה, קיבלתי. הפרטים המלאים של הנכס נפתחו עבורך למעלה.";
      try {
        const res = await fetch(`${backendUrl}/functions/v1/ai-agent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            lead_id: interest.lead_id,
            workspace_owner_id: interest.workspace_owner_id,
            messages: [{ role: "user", content: message }],
          }),
        });
        const parsed = await res.json().catch(() => null);
        if (parsed?.content) reply = String(parsed.content);
      } catch (err) {
        console.error("[public-lead-gate] rita call failed", err);
      }

      await admin.from("interaction_activity_log").insert({
        user_id: interest.workspace_owner_id,
        workspace_owner_id: interest.workspace_owner_id,
        thread_key: `public-board:${interest.listing_id}:${interest.id}`,
        platform: "web",
        action_type: "lead_gate_rita_turn",
        actor_type: "ai_agent",
        content: message,
        metadata: { listing_id: interest.listing_id, lead_id: interest.lead_id },
      });

      return json({ reply, unlocked: true });
    }

    // ---------------------------------------------------------- details
    if (action === "details") {
      const token = str(body?.token, 80);
      if (!token) return json({ error: "invalid request" }, 400);

      const { data: interest } = await admin
        .from("public_listing_interest")
        .select("listing_id, unlocked_at, workspace_owner_id")
        .eq("access_token", token)
        .maybeSingle();
      if (!interest) return json({ error: "invalid token" }, 404);
      if (!interest.unlocked_at) {
        return json({ error: "locked", unlocked: false }, 403);
      }

      const { data: listing } = await admin
        .from("listings")
        .select("*")
        .eq("id", interest.listing_id)
        .maybeSingle();
      if (!listing) return json({ error: "not found" }, 404);

      const [{ data: profile }, { data: brand }] = await Promise.all([
        admin.from("profiles").select("full_name, broker_byline, broker_license_number").eq("id", interest.workspace_owner_id).maybeSingle(),
        admin.from("white_label_settings").select("agency_name, logo_url").eq("user_id", interest.workspace_owner_id).maybeSingle(),
      ]);

      const card = toPublicCard(listing as any);
      return json({
        unlocked: true,
        property: {
          ...card,
          masked: false,
          address: listing.address ?? null,
          house_number: listing.house_number ?? null,
          apartment_number: listing.apartment_number ?? null,
          latitude: listing.latitude ?? null,
          longitude: listing.longitude ?? null,
          project_name: listing.project_name ?? null,
          available_from: listing.available_from ?? null,
          parking: listing.parking ?? null,
          elevator: listing.elevator ?? null,
          features: listing.features ?? null,
          attributes: listing.attributes ?? null,
          description: listing.long_description || listing.description || card.description,
        },
        contact: {
          broker_name: profile?.broker_byline || profile?.full_name || null,
          office_name: brand?.agency_name || null,
          broker_license_number: profile?.broker_license_number || null,
          whatsapp_number: OFFICIAL_WA,
          whatsapp_url: `https://wa.me/${OFFICIAL_WA}`,
        },
      });
    }

    return json({ error: "unknown action" }, 400);
  } catch (error) {
    console.error("[public-lead-gate]", error);
    return json({ error: "lead gate failed" }, 500);
  }
});
