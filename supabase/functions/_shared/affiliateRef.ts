// Inbound affiliate referral tags — `[ref:CODE]`.
//
// A public property page opened through an affiliate link appends a tracking
// tag to the WhatsApp CTA text, e.g.
//   "שלום, מתעניין/ת בנכס: בר אילן 2 (הרצליה) [ref:T66JSEZXE5]"
//
// Tracking codes are stored lowercase in `affiliate_referrals.tracking_code`
// while the link (and therefore the inbound message) may carry ANY casing, so
// every lookup here is case-insensitive. Every function is failure-tolerant:
// a missing code, an unknown code or a DB error is logged and returns null so
// the WhatsApp reply pipeline always continues.

// deno-lint-ignore-file no-explicit-any

/**
 * Extracts a referral code from inbound text.
 * Tolerates: `[ref:CODE]`, `[ref: CODE]`, `[ref=CODE]`, `【ref:CODE】`,
 * a missing closing bracket (`[ref:CODE` at the end of a truncated message)
 * and any casing. Returns the code lowercased, or null.
 */
export function extractRefCode(text: string | null | undefined): string | null {
  const raw = String(text ?? "");
  if (!raw) return null;
  const m = raw.match(/[[【(]\s*ref\s*[:=]\s*([A-Za-z0-9_-]{4,64})\s*[\]】)]?/i);
  const code = m?.[1]?.trim();
  return code ? code.toLowerCase() : null;
}

export type InboundReferral = {
  referral_id: string;
  tracking_code: string;
  affiliate_id: string;
  broker_id: string;
  listing_id: string | null;
  lead_id: string | null;
  status: string | null;
  reward_type: string | null;
  reward_amount: number | null;
  tier1_amount: number;
  tier2_amount: number;
  tier3_type: string;
  tier3_amount: number;
  listing: {
    id: string;
    property_title: string | null;
    address: string | null;
    city: string | null;
    neighborhood: string | null;
    deal_type: string | null;
    rooms: number | null;
    asking_price: number | null;
  } | null;
};

/** Resolves a referral row (+ its listing) by tracking code. Never throws. */
export async function resolveAffiliateReferral(
  admin: any,
  code: string | null,
): Promise<InboundReferral | null> {
  if (!code) return null;
  try {
    const { data, error } = await admin
      .from("affiliate_referrals")
      .select("id, affiliate_id, broker_id, listing_id, lead_id, tracking_code, status, reward_type, reward_amount, tier1_amount, tier2_amount, tier3_type, tier3_amount")
      .ilike("tracking_code", code)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn("[affiliate-ref] referral lookup soft-fail:", error.message, { code });
      return null;
    }
    if (!data?.id) {
      console.warn("[affiliate-ref] unknown tracking code — ignoring tag", { code });
      return null;
    }

    let listing: InboundReferral["listing"] = null;
    if (data.listing_id) {
      try {
        const { data: l } = await admin
          .from("listings")
          .select("id, property_title, address, city, neighborhood, deal_type, rooms, asking_price, affiliate_tier1_amount, affiliate_tier2_amount, affiliate_tier3_type, affiliate_tier3_amount")
          .eq("id", data.listing_id)
          .maybeSingle();
        listing = (l as any) ?? null;
      } catch (e) {
        console.warn("[affiliate-ref] listing lookup threw:", e instanceof Error ? e.message : e);
      }
    }

    // Prefer the immutable referral snapshot so a later broker edit cannot
    // retroactively change what was promised to the affiliate.
    const tiers = {
      tier1: Number((data as any)?.tier1_amount ?? (listing as any)?.affiliate_tier1_amount ?? 0),
      tier2: Number((data as any)?.tier2_amount ?? (listing as any)?.affiliate_tier2_amount ?? 0),
      tier3Type: String((data as any)?.tier3_type ?? (listing as any)?.affiliate_tier3_type ?? data.reward_type ?? "fixed"),
      tier3: Number((data as any)?.tier3_amount ?? (listing as any)?.affiliate_tier3_amount ?? data.reward_amount ?? 0),
    };

    return {
      referral_id: data.id,
      tracking_code: String(data.tracking_code ?? code),
      affiliate_id: data.affiliate_id,
      broker_id: data.broker_id,
      listing_id: data.listing_id ?? null,
      lead_id: data.lead_id ?? null,
      status: data.status ?? null,
      reward_type: data.reward_type ?? null,
      reward_amount: data.reward_amount ?? null,
      tier1_amount: tiers.tier1,
      tier2_amount: tiers.tier2,
      tier3_type: tiers.tier3Type,
      tier3_amount: tiers.tier3,
      listing,
    };
  } catch (e) {
    console.warn("[affiliate-ref] referral lookup threw:", e instanceof Error ? e.message : e, { code });
    return null;
  }
}

/** Human-readable property label for the CRM note / AI context. */
export function referralPropertyLabel(referral: InboundReferral): string {
  const l = referral.listing;
  if (!l) return "נכס מרשת השותפים";
  return [l.property_title, l.address, l.city].filter(Boolean).join(", ") || "נכס מרשת השותפים";
}

/**
 * Binds an inbound lead to its referral: tags the contact with the property and
 * the broker workspace, marks the referral as converted, and records an
 * affiliate submission so the affiliate's commission tracking starts.
 * Every write is independent and soft-failing — the reply never depends on it.
 */
export async function attachAffiliateReferral(
  admin: any,
  params: {
    referral: InboundReferral;
    leadId: string | null;
    leadName?: string | null;
    leadPhone?: string | null;
    inboundText?: string | null;
  },
): Promise<{ lead_tagged: boolean; referral_linked: boolean; submission_id: string | null }> {
  const { referral, leadId } = params;
  const out = { lead_tagged: false, referral_linked: false, submission_id: null as string | null };
  const now = new Date().toISOString();

  if (leadId) {
    try {
      const { data: existing } = await admin
        .from("leads")
        .select("id, preferences, interest_tag, deal_type, city")
        .eq("id", leadId)
        .maybeSingle();
      const prefs = (existing as any)?.preferences && typeof (existing as any).preferences === "object"
        ? { ...(existing as any).preferences }
        : {};
      prefs.source = prefs.source ?? "whatsapp";
      prefs.referral_code = referral.tracking_code;
      prefs.affiliate_id = referral.affiliate_id;
      prefs.referral_id = referral.referral_id;
      prefs.listing_id = referral.listing_id ?? prefs.listing_id ?? null;
      prefs.referral_property = referralPropertyLabel(referral);

      const update: Record<string, unknown> = {
        preferences: prefs,
        workspace_owner_id: referral.broker_id,
        assigned_to: referral.broker_id,
        last_interaction_at: now,
        lead_stage: "engaging",
      };
      if (referral.listing_id && !(existing as any)?.interest_tag) update.interest_tag = referral.listing_id;
      if (referral.listing?.deal_type && !(existing as any)?.deal_type) update.deal_type = referral.listing.deal_type;
      if (referral.listing?.city && !(existing as any)?.city) update.city = referral.listing.city;

      const { error } = await admin.from("leads").update(update).eq("id", leadId);
      if (error) console.warn("[affiliate-ref] lead tag soft-fail:", error.message);
      else out.lead_tagged = true;
    } catch (e) {
      console.warn("[affiliate-ref] lead tag threw:", e instanceof Error ? e.message : e);
    }
  }

  try {
    const update: Record<string, unknown> = { updated_at: now };
    if (leadId) update.lead_id = leadId;
    // Allowed values: promoting | clicked | lead_captured | qualified | ...
    if (!referral.status || referral.status === "promoting" || referral.status === "clicked") {
      update.status = "lead_captured";
    }
    const { error } = await admin.from("affiliate_referrals").update(update).eq("id", referral.referral_id);
    if (error) console.warn("[affiliate-ref] referral link soft-fail:", error.message);
    else out.referral_linked = true;
  } catch (e) {
    console.warn("[affiliate-ref] referral link threw:", e instanceof Error ? e.message : e);
  }

  // One submission per referral+lead — never duplicate on repeat messages.
  try {
    const { data: dupe } = await admin
      .from("affiliate_lead_submissions")
      .select("id")
      .eq("referral_id", referral.referral_id)
      .limit(1)
      .maybeSingle();
    if (dupe?.id) {
      out.submission_id = dupe.id;
      if (leadId) {
        await admin.from("affiliate_lead_submissions").update({ lead_id: leadId, updated_at: now }).eq("id", dupe.id);
      }
    } else {
      const { data: created, error } = await admin
        .from("affiliate_lead_submissions")
        .insert({
          affiliate_id: referral.affiliate_id,
          broker_id: referral.broker_id,
          listing_id: referral.listing_id,
          referral_id: referral.referral_id,
          lead_id: leadId,
          lead_name: params.leadName?.trim() || "מתעניין/ת מרשת השותפים",
          lead_phone: params.leadPhone ?? null,
          notes: `הגעה דרך קישור שיווק של שותף (${referral.tracking_code}) — ${referralPropertyLabel(referral)}`,
          status: "submitted",
          tier1_amount: referral.tier1_amount,
          tier2_amount: referral.tier2_amount,
          tier3_type: referral.tier3_type,
          tier3_amount: referral.tier3_amount,
        })
        .select("id")
        .maybeSingle();
      if (error) console.warn("[affiliate-ref] submission insert soft-fail:", error.message);
      else out.submission_id = (created as any)?.id ?? null;
    }
  } catch (e) {
    console.warn("[affiliate-ref] submission insert threw:", e instanceof Error ? e.message : e);
  }

  console.log("[affiliate-ref] inbound referral processed", {
    code: referral.tracking_code,
    lead_id: leadId,
    broker_id: referral.broker_id,
    listing_id: referral.listing_id,
    ...out,
  });
  return out;
}

/** Strips the `[ref:...]` tag so it never reaches the AI prompt or the inbox text. */
export function stripRefTag(text: string | null | undefined): string {
  return String(text ?? "").replace(/[[【(]\s*ref\s*[:=]\s*[A-Za-z0-9_-]{4,64}\s*[\]】)]?/gi, "").replace(/\s{2,}/g, " ").trim();
}
