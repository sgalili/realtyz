// waContextRouter
// ───────────────
// Every workspace shares the SAME official Meta WhatsApp number
// (972537983832), so the receiving phone_number_id can no longer identify the
// tenant. An inbound message is therefore routed by CONVERSATION CONTEXT:
// the workspace whose outbound message to that phone is the most recent one.
//
// Resolution order:
//   1. Most recent OUTBOUND message to any lead holding this phone → that
//      lead's workspace (assigned_to).
//   2. Most recent inbound message on such a lead (thread already lives there).
//   3. Most recently updated owned lead with that phone.
// Nothing matched → caller keeps its own fallback (provider row / admin).

type MinimalClient = { from: (t: string) => any };

export function waPhoneVariants(raw: string): string[] {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return [];
  const local = digits.startsWith("972") ? `0${digits.slice(3)}` : digits;
  const intl = digits.startsWith("0") ? `972${digits.slice(1)}` : digits;
  return Array.from(
    new Set([String(raw ?? ""), digits, `+${digits}`, local, intl, `+${intl}`].filter(Boolean)),
  );
}

export interface WaContext {
  leadId: string | null;
  ownerId: string | null;
  /** How the workspace was chosen, for logging only. */
  reason: string;
}

export async function resolveWaContext(
  admin: MinimalClient,
  rawPhone: string,
): Promise<WaContext> {
  const empty: WaContext = { leadId: null, ownerId: null, reason: "no_match" };
  const variants = waPhoneVariants(rawPhone);
  if (!variants.length) return empty;

  let leads: Array<{ id: string; assigned_to: string | null; updated_at: string | null }> = [];
  try {
    const { data } = await admin
      .from("leads")
      .select("id, assigned_to, updated_at")
      .in("phone_number", variants)
      .limit(50);
    leads = (data ?? []) as typeof leads;
  } catch (e) {
    console.warn("[waContextRouter] lead lookup threw", e instanceof Error ? e.message : e);
    return empty;
  }
  if (!leads.length) return empty;

  const owned = leads.filter((l) => !!l.assigned_to);
  if (owned.length === 1) {
    return { leadId: owned[0].id, ownerId: owned[0].assigned_to, reason: "single_owned_lead" };
  }

  const ids = leads.map((l) => l.id);
  const byId = new Map(leads.map((l) => [l.id, l]));

  // 1 + 2. Last outbound wins; otherwise the most recent message of any direction.
  for (const direction of ["outbound", null] as Array<string | null>) {
    try {
      let q = admin
        .from("messages")
        .select("lead_id, direction, created_at")
        .in("lead_id", ids)
        .order("created_at", { ascending: false })
        .limit(20);
      if (direction) q = q.eq("direction", direction);
      const { data } = await q;
      const rows = (data ?? []) as Array<{ lead_id: string | null }>;
      for (const row of rows) {
        const lead = row.lead_id ? byId.get(row.lead_id) : undefined;
        if (lead?.assigned_to) {
          return {
            leadId: lead.id,
            ownerId: lead.assigned_to,
            reason: direction ? "last_outbound_session" : "last_thread_message",
          };
        }
      }
    } catch (e) {
      console.warn("[waContextRouter] message lookup threw", e instanceof Error ? e.message : e);
    }
  }

  // 3. Freshest owned lead.
  const freshest = owned
    .slice()
    .sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")))[0];
  if (freshest) {
    return { leadId: freshest.id, ownerId: freshest.assigned_to, reason: "freshest_owned_lead" };
  }
  return { leadId: leads[0].id, ownerId: null, reason: "unowned_lead" };
}
