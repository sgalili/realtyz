/**
 * Deterministic CRM write layer for the internal (dashboard) agent.
 *
 * The model NEVER writes SQL for mutations. Instead it emits a structured
 * action envelope:
 *
 *   {"type":"actions","content":"<Hebrew confirmation>","actions":[{...}]}
 *
 * Every action below is executed server-side with the service role and scoped
 * to the requesting workspace owner, so quick actions created by the AI show up
 * instantly on "משימות היום" exactly like the ones the human creates by hand.
 */

export type CrmAction = Record<string, any>;

export const CRM_ACTIONS_CONTRACT = `
[CRM WRITE ACTIONS - MANDATORY PROTOCOL]
You have FULL write access to the CRM (contacts + properties) and to JSON imports.
NEVER say that the CRM, an import, or a data operation is "not supported", "broken",
"unavailable", or that you "cannot change the system". Those statements are false and
forbidden. If the owner asks you to add / update / delete / merge contacts or properties,
or hands you a JSON file, you EXECUTE it through the action envelope and report the result.
The ONLY legitimate reason to not execute is a missing mandatory field (e.g. a phone number
for a brand-new contact) — in that case ask precisely for that one field.
You must never emit INSERT/UPDATE/DELETE SQL. Use this envelope instead:
{"type":"actions","content":"<אישור קצר בעברית של מה שבוצע>","actions":[ ... ]}

Supported actions (use exact "kind" values):
- {"kind":"create_contact","full_name":"...","phone":"05...","email":"...","city":"...","deal_type":"sale|rent","lead_stage":"...","interest_tag":"...","notes":"..."}
- {"kind":"update_contact","lead_id":"<uuid>","phone":"05...","full_name":"...","email":"...","city":"...","deal_type":"...","lead_stage":"...","interest_tag":"...","status":"...","ai_autopilot":true}
  (identify the contact by lead_id when you know it, otherwise by phone; if neither exists, use create_contact)
- {"kind":"delete_contact","lead_id":"<uuid>"} or {"kind":"delete_contact","phone":"05..."}
- {"kind":"merge_contacts","primary_lead_id":"<uuid>","duplicate_lead_id":"<uuid>"}
  (keeps the primary card, fills its empty fields from the duplicate, moves the history, deletes the duplicate)
- {"kind":"create_property","property_title":"...","address":"...","city":"...","neighborhood":"...","rooms":3.5,"sqm":90,"floor":2,"asking_price":3500000,"deal_type":"sale|rent","description":"...","office_notes":"...","owner_name":"...","owner_phone":"05..."}
- {"kind":"update_property","listing_id":"<uuid>","address":"...","asking_price":123,"status":"live|pending|discarded", ...}
  (identify by listing_id, else by address+city; matching ignores punctuation and spelling variants)
- {"kind":"delete_property","listing_id":"<uuid>"}
- {"kind":"import_json","payload":{ "contacts":[...], "properties":[...] },"dry_run":false}
  (use this for any JSON the owner pasted into the chat; a JSON FILE the owner attached is imported automatically before you answer, and its report is given to you)
- {"kind":"create_note","content":"...","lead_id":"<uuid|null>","listing_id":"<uuid|null>"}
- {"kind":"log_call","content":"סיכום השיחה...","lead_id":"<uuid|null>","channel":"phone|whatsapp"}
- {"kind":"create_reminder","title":"...","content":"...","due_at":"<ISO 8601>","priority":"high|medium|low","lead_id":"<uuid|null>","listing_id":"<uuid|null>"}
- {"kind":"create_task","title":"...","content":"...","due_at":"<ISO 8601>","priority":"high|medium|low","action_type":"follow_up|call|property_search|status_check","lead_id":"<uuid|null>","listing_id":"<uuid|null>"}
- {"kind":"complete_task","task_id":"<uuid>"}
- {"kind":"delete_task","task_id":"<uuid>"}

Rules:
- Duplicates are MERGED, never rejected: same phone (after normalization) = same person; same address written differently ("ש״י עגנון 72" vs "שי עגנון 72") = same property.
- Israeli phones: keep digits only, normalize to 05XXXXXXXX / 9725XXXXXXXX. A new contact REQUIRES a phone number; if the owner did not give one, ask for it instead of emitting create_contact.
- due_at must be a real absolute ISO timestamp (resolve "מחר בעשר" against the current time), between 09:00 and 21:00 Israel time.
- Only include fields you actually know. Never invent a phone, email or price. Never send null to overwrite an existing value.
- Deletion is allowed only when the owner explicitly asked for it, and you must name what you deleted in the confirmation.
- "content" of the envelope is what the owner reads: state plainly and accurately what you did (counts included), in Hebrew, without JSON, UUIDs or markdown.
`.trim();


/** Israeli phone normalization: 9725XXXXXXXX for storage. */
export function normalizeIlPhone(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  if (digits.length === 9) return `972${digits}`;
  return digits;
}

function isoOrNull(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const PRIORITIES = new Set(["high", "medium", "low"]);

export type CrmActionResult = {
  kind: string;
  ok: boolean;
  id?: string;
  error?: string;
};

/**
 * Execute the model's action envelope. Returns one result per action; a failing
 * action never aborts the rest.
 */
export async function executeCrmActions(
  supabase: any,
  ownerId: string | null,
  actions: CrmAction[],
): Promise<CrmActionResult[]> {
  const out: CrmActionResult[] = [];
  if (!ownerId) {
    return (actions ?? []).map((a) => ({
      kind: String(a?.kind ?? "unknown"),
      ok: false,
      error: "no_owner_context",
    }));
  }

  const findLead = async (a: CrmAction): Promise<any | null> => {
    if (a.lead_id) {
      const { data } = await supabase.from("leads").select("id, full_name, phone_number").eq("id", a.lead_id).maybeSingle();
      if (data) return data;
    }
    const phone = normalizeIlPhone(a.phone ?? a.phone_number);
    if (phone) {
      const { data } = await supabase
        .from("leads")
        .select("id, full_name, phone_number")
        .eq("assigned_to", ownerId)
        .eq("phone_number", phone)
        .maybeSingle();
      if (data) return data;
    }
    if (a.full_name) {
      const { data } = await supabase
        .from("leads")
        .select("id, full_name, phone_number")
        .eq("assigned_to", ownerId)
        .ilike("full_name", String(a.full_name).trim())
        .limit(1);
      if (Array.isArray(data) && data[0]) return data[0];
    }
    return null;
  };

  const leadFields = (a: CrmAction) => {
    const patch: Record<string, unknown> = {};
    const phone = normalizeIlPhone(a.phone ?? a.phone_number);
    if (phone) patch.phone_number = phone;
    if (a.full_name) patch.full_name = String(a.full_name).trim();
    if (a.email) patch.email = String(a.email).trim();
    if (a.city) patch.city = String(a.city).trim();
    if (a.deal_type === "sale" || a.deal_type === "rent") patch.deal_type = a.deal_type;
    if (a.lead_stage) patch.lead_stage = String(a.lead_stage);
    if (a.interest_tag) patch.interest_tag = String(a.interest_tag);
    if (a.status) patch.status = String(a.status);
    if (typeof a.ai_autopilot === "boolean") patch.ai_autopilot = a.ai_autopilot;
    return patch;
  };

  /** Address matching that survives punctuation and spelling variants ("ש״י עגנון 72" ≡ "שי עגנון 72"). */
  const addrKey = (v: unknown) =>
    String(v ?? "")
      .replace(/[״"'`׳,.\-]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const findListing = async (a: CrmAction): Promise<any | null> => {
    if (a.listing_id) {
      const { data } = await supabase.from("listings").select("id, address, city").eq("id", a.listing_id).maybeSingle();
      if (data) return data;
    }
    const wanted = addrKey(a.address ?? a.property_title);
    if (!wanted) return null;
    const { data } = await supabase
      .from("listings")
      .select("id, address, city, property_title")
      .eq("user_id", ownerId)
      .limit(500);
    const city = addrKey(a.city);
    return (
      (data ?? []).find((r: any) => {
        const hit = addrKey(r.address) === wanted || addrKey(r.property_title) === wanted;
        if (!hit) return false;
        return !city || !r.city || addrKey(r.city) === city;
      }) ?? null
    );
  };

  const listingFields = (a: CrmAction) => {
    const patch: Record<string, unknown> = {};
    const text = ["property_title", "address", "city", "neighborhood", "description", "long_description", "short_description", "office_notes", "project_name", "house_number", "apartment_number", "source_url", "external_id"];
    for (const k of text) if (a[k] !== undefined && a[k] !== null && a[k] !== "") patch[k] = String(a[k]).trim();
    for (const k of ["rooms", "asking_price"]) if (a[k] !== undefined && a[k] !== null && a[k] !== "") patch[k] = Number(a[k]);
    for (const k of ["sqm", "floor"]) if (a[k] !== undefined && a[k] !== null && a[k] !== "") patch[k] = parseInt(String(a[k]), 10);
    for (const k of ["elevator", "parking", "is_published", "is_featured"]) if (typeof a[k] === "boolean") patch[k] = a[k];
    if (a.deal_type === "sale" || a.deal_type === "rent") patch.deal_type = a.deal_type;
    if (["live", "pending", "discarded"].includes(String(a.status))) patch.status = String(a.status);
    if (a.features && typeof a.features === "object") patch.features = a.features;
    return patch;
  };


  const logActivity = async (a: CrmAction, actionType: string, platform: string, content: string) => {
    const { data, error } = await supabase
      .from("interaction_activity_log")
      .insert({
        user_id: ownerId,
        thread_key: a.lead_id ? `lead:${a.lead_id}` : `owner:${ownerId}`,
        platform,
        action_type: actionType,
        actor_type: "ai",
        actor_id: null,
        actor_label: "עוזר AI",
        content,
        metadata: {
          lead_id: a.lead_id ?? null,
          listing_id: a.listing_id ?? null,
          source: "ai_agent_quick_action",
        },
      })
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return data?.id as string | undefined;
  };

  const insertScheduledItem = async (a: CrmAction, actionType: string) => {
    const title = String(a.title ?? a.content ?? "משימה").slice(0, 300);
    const priority = PRIORITIES.has(String(a.priority)) ? String(a.priority) : "medium";
    const { data, error } = await supabase
      .from("scheduled_items")
      .insert({
        user_id: ownerId,
        title,
        content: String(a.content ?? title),
        item_type: "task",
        channel: "internal",
        status: "pending",
        scheduled_for: isoOrNull(a.due_at) ?? new Date().toISOString(),
        metadata: {
          lead_id: a.lead_id ?? null,
          listing_id: a.listing_id ?? null,
          priority,
          action_type: actionType,
          source: "ai_agent_quick_action",
        },
      })
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return data?.id as string | undefined;
  };

  for (const a of Array.isArray(actions) ? actions.slice(0, 12) : []) {
    const kind = String(a?.kind ?? "").trim();
    try {
      switch (kind) {
        case "create_contact": {
          const existing = await findLead(a);
          const fields = leadFields(a);
          if (existing) {
            // Dedupe: never create a second card for the same person.
            const { error } = await supabase.from("leads").update(fields).eq("id", existing.id);
            if (error) throw error;
            if (a.notes) await logActivity({ ...a, lead_id: existing.id }, "note", "internal", String(a.notes));
            out.push({ kind, ok: true, id: existing.id });
            break;
          }
          // leads.phone_number is NOT NULL — never fabricate a number, ask instead.
          if (!fields.phone_number) throw new Error("missing_phone");
          const { data, error } = await supabase
            .from("leads")
            .insert({ assigned_to: ownerId, ...fields, last_interaction_at: new Date().toISOString() })
            .select("id")
            .maybeSingle();
          if (error) throw error;
          if (a.notes && data?.id) await logActivity({ ...a, lead_id: data.id }, "note", "internal", String(a.notes));
          out.push({ kind, ok: true, id: data?.id });
          break;
        }
        case "update_contact": {
          const existing = await findLead(a);
          if (!existing) throw new Error("contact_not_found");
          const fields = leadFields(a);
          if (Object.keys(fields).length === 0) throw new Error("nothing_to_update");
          const { error } = await supabase.from("leads").update(fields).eq("id", existing.id);
          if (error) throw error;
          out.push({ kind, ok: true, id: existing.id });
          break;
        }
        case "delete_contact": {
          const existing = await findLead(a);
          if (!existing) throw new Error("contact_not_found");
          const { error } = await supabase.from("leads").delete().eq("id", existing.id);
          if (error) throw error;
          out.push({ kind, ok: true, id: existing.id });
          break;
        }
        case "merge_contacts": {
          const primaryId = String(a.primary_lead_id ?? a.lead_id ?? "");
          const dupId = String(a.duplicate_lead_id ?? "");
          if (!primaryId || !dupId || primaryId === dupId) throw new Error("missing_merge_ids");
          const { data: rows } = await supabase
            .from("leads").select("*").in("id", [primaryId, dupId]);
          const primary = (rows ?? []).find((r: any) => r.id === primaryId);
          const dup = (rows ?? []).find((r: any) => r.id === dupId);
          if (!primary || !dup) throw new Error("contact_not_found");
          const patch: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(dup)) {
            if (["id", "created_at", "fts", "assigned_to"].includes(k)) continue;
            if (v === null || v === "" || v === undefined) continue;
            const cur = (primary as any)[k];
            if (cur === null || cur === "" || cur === undefined) patch[k] = v;
          }
          if (Object.keys(patch).length) {
            const { error } = await supabase.from("leads").update(patch).eq("id", primaryId);
            if (error) throw error;
          }
          // Move history over, then drop the duplicate card.
          await supabase.from("messages").update({ lead_id: primaryId }).eq("lead_id", dupId);
          await supabase.from("interaction_activity_log")
            .update({ thread_key: `lead:${primaryId}` }).eq("thread_key", `lead:${dupId}`);
          const { error: delErr } = await supabase.from("leads").delete().eq("id", dupId);
          if (delErr) throw delErr;
          out.push({ kind, ok: true, id: primaryId });
          break;
        }
        case "create_property": {
          const existing = await findListing(a);
          const fields = listingFields(a);
          if (existing) {
            const { error } = await supabase.from("listings").update(fields).eq("id", existing.id);
            if (error) throw error;
            out.push({ kind, ok: true, id: existing.id });
            break;
          }
          const title = String(fields.property_title ?? fields.address ?? "").trim();
          if (!title) throw new Error("missing_property_title");
          const slug = `${title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60).toLowerCase() || "listing"}-${Math.random().toString(36).slice(2, 7)}`;
          const { data, error } = await supabase
            .from("listings")
            .insert({
              user_id: ownerId,
              property_title: title,
              description: fields.description ?? "",
              asking_price: fields.asking_price ?? 0,
              status: fields.status ?? "live",
              source: "manual",
              slug,
              ...fields,
            })
            .select("id")
            .maybeSingle();
          if (error) throw error;
          out.push({ kind, ok: true, id: data?.id });
          break;
        }
        case "update_property": {
          const existing = await findListing(a);
          if (!existing) throw new Error("property_not_found");
          const fields = listingFields(a);
          if (Object.keys(fields).length === 0) throw new Error("nothing_to_update");
          const { error } = await supabase.from("listings").update(fields).eq("id", existing.id);
          if (error) throw error;
          out.push({ kind, ok: true, id: existing.id });
          break;
        }
        case "delete_property": {
          const existing = await findListing(a);
          if (!existing) throw new Error("property_not_found");
          const { error } = await supabase.from("listings").delete().eq("id", existing.id);
          if (error) throw error;
          out.push({ kind, ok: true, id: existing.id });
          break;
        }
        case "import_json": {
          const { importCrmJson } = await import("./crmJsonImport.ts");
          const report = await importCrmJson(supabase, ownerId, a.payload ?? a.data ?? a.json, {
            dry_run: !!a.dry_run,
          });
          if (!report.ok) throw new Error(report.errors.join(", ") || "import_failed");
          out.push({ kind, ok: true, report } as CrmActionResult);
          break;
        }

        case "create_note": {
          const content = String(a.content ?? "").trim();
          if (!content) throw new Error("empty_note");
          const id = await logActivity(a, "note", "internal", content);
          out.push({ kind, ok: true, id });
          break;
        }
        case "log_call": {
          const content = String(a.content ?? "").trim();
          if (!content) throw new Error("empty_call_summary");
          const id = await logActivity(a, "interaction", String(a.channel ?? "phone"), content);
          out.push({ kind, ok: true, id });
          break;
        }
        case "create_reminder": {
          const id = await insertScheduledItem(a, "follow_up");
          out.push({ kind, ok: true, id });
          break;
        }
        case "create_task": {
          const id = await insertScheduledItem(a, String(a.action_type ?? "follow_up"));
          out.push({ kind, ok: true, id });
          break;
        }
        case "complete_task": {
          if (!a.task_id) throw new Error("missing_task_id");
          const { error } = await supabase
            .from("scheduled_items")
            .update({ status: "completed" })
            .eq("id", a.task_id)
            .eq("user_id", ownerId);
          if (error) throw error;
          out.push({ kind, ok: true, id: String(a.task_id) });
          break;
        }
        case "delete_task": {
          if (!a.task_id) throw new Error("missing_task_id");
          const { error } = await supabase
            .from("scheduled_items")
            .delete()
            .eq("id", a.task_id)
            .eq("user_id", ownerId);
          if (error) throw error;
          out.push({ kind, ok: true, id: String(a.task_id) });
          break;
        }
        default:
          out.push({ kind: kind || "unknown", ok: false, error: "unsupported_action" });
      }
    } catch (e) {
      out.push({ kind: kind || "unknown", ok: false, error: (e as Error).message });
    }
  }

  return out;
}
