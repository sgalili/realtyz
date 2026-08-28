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
You CAN change the CRM, but ONLY through the action envelope below. Never emit INSERT/UPDATE/DELETE SQL.
When the owner asks you to create, change or delete a contact, note, reminder, task, call summary or meeting, answer with a single JSON object:
{"type":"actions","content":"<אישור קצר בעברית של מה שבוצע>","actions":[ ... ]}

Supported actions (use exact "kind" values):
- {"kind":"create_contact","full_name":"...","phone":"05...","email":"...","city":"...","deal_type":"sale|rent","lead_stage":"...","interest_tag":"...","notes":"..."}
- {"kind":"update_contact","lead_id":"<uuid>","phone":"05...","full_name":"...","email":"...","city":"...","deal_type":"...","lead_stage":"...","interest_tag":"...","status":"...","ai_autopilot":true}
  (identify the contact by lead_id when you know it, otherwise by phone; if neither exists, use create_contact)
- {"kind":"create_note","content":"...","lead_id":"<uuid|null>","listing_id":"<uuid|null>"}
- {"kind":"log_call","content":"סיכום השיחה...","lead_id":"<uuid|null>","channel":"phone|whatsapp"}
- {"kind":"create_reminder","title":"...","content":"...","due_at":"<ISO 8601>","priority":"high|medium|low","lead_id":"<uuid|null>","listing_id":"<uuid|null>"}
- {"kind":"create_task","title":"...","content":"...","due_at":"<ISO 8601>","priority":"high|medium|low","action_type":"follow_up|call|property_search|status_check","lead_id":"<uuid|null>","listing_id":"<uuid|null>"}
- {"kind":"complete_task","task_id":"<uuid>"}
- {"kind":"delete_task","task_id":"<uuid>"}

Rules:
- Israeli phones: keep digits only, normalize to 05XXXXXXXX / 9725XXXXXXXX. A new contact REQUIRES a phone number; if the owner did not give one, ask for it instead of emitting create_contact.
- due_at must be a real absolute ISO timestamp (resolve "מחר בעשר" against the current time), between 09:00 and 21:00 Israel time.
- Only include fields you actually know. Never invent a phone, email or price.
- "content" of the envelope is what the owner reads: state plainly what you did, in Hebrew, without JSON, UUIDs or markdown.
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
        .eq("user_id", ownerId)
        .eq("phone_number", phone)
        .maybeSingle();
      if (data) return data;
    }
    if (a.full_name) {
      const { data } = await supabase
        .from("leads")
        .select("id, full_name, phone_number")
        .eq("user_id", ownerId)
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
            .insert({ user_id: ownerId, ...fields, last_interaction_at: new Date().toISOString() })
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
