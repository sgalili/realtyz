/**
 * JSON CRM ingestion engine (contacts + properties).
 *
 * Accepts almost any shape a broker can hand over:
 *   - a bare array of records
 *   - { contacts: [...], properties: [...] }  (also leads / anשי / נכסים keys)
 *   - { data: {...} } / { records: [...] }
 *   - a JSON string
 *
 * Field names are mapped from Hebrew or English keys to the real schema.
 * Everything is UPSERT/MERGE only: an existing record is never deleted, and a
 * null/empty incoming value never overwrites a stored value.
 *
 * Ownership: leads are scoped by `assigned_to`, listings by `user_id`.
 */

import { normalizeIlPhone } from "./crmActions.ts";

export type ImportRowReport = {
  entity: "contact" | "property";
  label: string;
  action: "created" | "updated" | "merged" | "skipped" | "rejected";
  id?: string;
  reason?: string;
  changed_fields?: string[];
};

export type ImportReport = {
  ok: boolean;
  dry_run: boolean;
  totals: {
    contacts_created: number;
    contacts_updated: number;
    contacts_merged: number;
    properties_created: number;
    properties_updated: number;
    properties_merged: number;
    rejected: number;
    skipped: number;
  };
  rows: ImportRowReport[];
  errors: string[];
};

const CONTACT_KEYS = [
  "contacts", "leads", "clients", "people",
  "אנשי_קשר", "אנשיקשר", "לקוחות", "מתעניינים", "אנשי קשר",
];
const PROPERTY_KEYS = [
  "properties", "listings", "assets",
  "נכסים", "דירות", "נכס",
];

/** ---------- generic helpers ---------- */

function norm(k: string): string {
  return String(k).trim().toLowerCase().replace(/[\s_\-'"״׳]/g, "");
}

function pick(rec: Record<string, any>, aliases: string[]): any {
  const map = new Map<string, any>();
  for (const [k, v] of Object.entries(rec ?? {})) map.set(norm(k), v);
  for (const a of aliases) {
    const v = map.get(norm(a));
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

function str(v: any): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === "" || s.toLowerCase() === "null" ? undefined : s;
}

function num(v: any): number | undefined {
  const s = str(v);
  if (!s) return undefined;
  const cleaned = s.replace(/[^\d.\-]/g, "");
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function bool(v: any): boolean | undefined {
  const s = str(v)?.toLowerCase();
  if (!s) return undefined;
  if (["true", "yes", "1", "כן", "יש"].includes(s)) return true;
  if (["false", "no", "0", "לא", "אין"].includes(s)) return false;
  return undefined;
}

/** Address key used for fuzzy property dedupe: strips punctuation + spaces. */
export function addressKey(...parts: Array<string | undefined>): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .replace(/["'״׳,.\-]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function slugify(s: string): string {
  return (
    s.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60).toLowerCase() ||
    "listing"
  );
}

/** ---------- payload flattening ---------- */

export function extractRecordSets(raw: unknown): {
  contacts: Record<string, any>[];
  properties: Record<string, any>[];
  unknown: Record<string, any>[];
} {
  let payload: any = raw;
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch { payload = null; }
  }
  const contacts: Record<string, any>[] = [];
  const properties: Record<string, any>[] = [];
  const unknown: Record<string, any>[] = [];

  const walk = (node: any, depth = 0) => {
    if (!node || depth > 5) return;
    if (Array.isArray(node)) {
      for (const item of node) {
        if (item && typeof item === "object" && !Array.isArray(item)) unknown.push(item);
      }
      return;
    }
    if (typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      const nk = norm(k);
      if (CONTACT_KEYS.some((a) => norm(a) === nk) && Array.isArray(v)) {
        contacts.push(...(v.filter((x) => x && typeof x === "object") as any[]));
      } else if (PROPERTY_KEYS.some((a) => norm(a) === nk) && Array.isArray(v)) {
        properties.push(...(v.filter((x) => x && typeof x === "object") as any[]));
      } else if (v && typeof v === "object") {
        walk(v, depth + 1);
      }
    }
  };
  walk(payload);

  // A bare object that looks like a single record.
  if (
    contacts.length === 0 && properties.length === 0 && unknown.length === 0 &&
    payload && typeof payload === "object" && !Array.isArray(payload)
  ) {
    unknown.push(payload as Record<string, any>);
  }

  // Classify leftovers by their own fields.
  for (const rec of unknown) {
    const looksProperty = pick(rec, [
      "property_title", "כותרת", "כתובת נכס", "rooms", "חדרים", "asking_price", "מחיר",
      "sqm", 'מ"ר', "listing", "נכס", "street", "רחוב",
    ]) !== undefined;
    const looksContact = pick(rec, [
      "phone", "phone_number", "טלפון", "נייד", "full_name", "שם", "שם מלא", "email", "מייל",
    ]) !== undefined;
    if (looksContact) contacts.push(rec);
    else if (looksProperty) properties.push(rec);
  }

  return { contacts, properties, unknown };
}

/** ---------- field mapping ---------- */

export function mapContact(rec: Record<string, any>) {
  const rawPhone = str(pick(rec, [
    "phone", "phone_number", "mobile", "cell", "טלפון", "נייד", "מספר טלפון", "מס טלפון", "טלפון נייד",
  ]));
  const out: Record<string, any> = {
    phone_number: rawPhone ? normalizeIlPhone(rawPhone) : undefined,
    full_name: str(pick(rec, ["full_name", "name", "שם", "שם מלא", "שם הלקוח", "לקוח"])),
    email: str(pick(rec, ["email", "mail", "מייל", "אימייל", "דואר אלקטרוני"])),
    city: str(pick(rec, ["city", "עיר", "יישוב", "ישוב"])),
    neighborhood: str(pick(rec, ["neighborhood", "שכונה", "אזור"])),
    address: str(pick(rec, ["address", "כתובת"])),
    status: str(pick(rec, ["status", "סטטוס"])),
    lead_stage: str(pick(rec, ["lead_stage", "stage", "שלב", "שלב בתהליך"])),
    interest_tag: str(pick(rec, ["interest_tag", "interest", "תיוג", "תחום עניין", "עניין"])),
    identity_number: str(pick(rec, ["identity_number", "id_number", "ת.ז", "תז", "מספר זהות"])),
    commission_amount: num(pick(rec, ["commission_amount", "commission", "עמלה"])),
    expected_close_date: str(pick(rec, ["expected_close_date", "תאריך סגירה", "צפי סגירה"])),
    profile_picture_url: str(pick(rec, ["profile_picture_url", "avatar", "תמונה"])),
  };
  const deal = str(pick(rec, ["deal_type", "סוג עסקה", "עסקה", "type"]))?.toLowerCase();
  if (deal) {
    if (/rent|שכיר|להשכרה/.test(deal)) out.deal_type = "rent";
    else if (/sale|מכיר|למכירה|קניה|רכיש/.test(deal)) out.deal_type = "sale";
  }
  const notes = str(pick(rec, ["notes", "note", "הערות", "הערה", "סיכום"]));
  const prefs = pick(rec, ["preferences", "העדפות", "דרישות"]);
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return { fields: out, notes, preferences: prefs && typeof prefs === "object" ? prefs : undefined };
}

export function mapProperty(rec: Record<string, any>) {
  const street = str(pick(rec, ["street", "רחוב"]));
  const houseNumber = str(pick(rec, ["house_number", "מספר בית", "מס בית"]));
  const address = str(pick(rec, ["address", "כתובת", "כתובת מלאה"])) ??
    [street, houseNumber].filter(Boolean).join(" ") || undefined;
  const out: Record<string, any> = {
    property_title: str(pick(rec, ["property_title", "title", "כותרת", "שם הנכס", "נכס"])),
    address,
    house_number: houseNumber,
    city: str(pick(rec, ["city", "עיר", "יישוב", "ישוב"])),
    neighborhood: str(pick(rec, ["neighborhood", "שכונה", "אזור"])),
    project_name: str(pick(rec, ["project_name", "פרויקט"])),
    rooms: num(pick(rec, ["rooms", "חדרים", "מספר חדרים"])),
    sqm: num(pick(rec, ["sqm", "size", 'מ"ר', "מטר", "שטח"])),
    floor: num(pick(rec, ["floor", "קומה"])),
    asking_price: num(pick(rec, ["asking_price", "price", "מחיר", "מחיר מבוקש"])),
    description: str(pick(rec, ["description", "תיאור", "פירוט"])),
    office_notes: str(pick(rec, ["office_notes", "notes", "הערות", "הערות משרד"])),
    source_url: str(pick(rec, ["source_url", "url", "link", "קישור"])),
    external_id: str(pick(rec, ["external_id", "id_external", "מזהה חיצוני", "מספר נכס"])),
    status: str(pick(rec, ["status", "סטטוס"])),
    available_from: str(pick(rec, ["available_from", "תאריך פינוי", "פינוי"])),
  };
  const parking = bool(pick(rec, ["parking", "חניה"]));
  if (parking !== undefined) out.parking = parking;
  const elevator = bool(pick(rec, ["elevator", "מעלית"]));
  if (elevator !== undefined) out.elevator = elevator;
  const deal = str(pick(rec, ["deal_type", "סוג עסקה", "עסקה"]))?.toLowerCase();
  if (deal) out.deal_type = /rent|שכיר|להשכרה/.test(deal) ? "rent" : "sale";
  if (out.sqm !== undefined) out.sqm = Math.round(Number(out.sqm));
  if (out.floor !== undefined) out.floor = Math.round(Number(out.floor));
  const owner = {
    name: str(pick(rec, ["owner_name", "שם בעל הנכס", "בעל הנכס", "בעלים"])),
    phone: str(pick(rec, ["owner_phone", "טלפון בעל הנכס", "טלפון בעלים"])),
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return { fields: out, owner: owner.name || owner.phone ? owner : undefined };
}

/** Merge patch: only fill fields that are empty on the stored row, or differ. */
function mergePatch(existing: Record<string, any>, incoming: Record<string, any>) {
  const patch: Record<string, any> = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v === undefined || v === null || v === "") continue;
    const cur = existing[k];
    const curEmpty = cur === null || cur === undefined || cur === "";
    if (curEmpty) patch[k] = v;
    else if (String(cur) !== String(v) && (k === "status" || k === "lead_stage" || k === "asking_price" || k === "interest_tag" || k === "deal_type" || k === "rooms" || k === "sqm" || k === "floor" || k === "office_notes" || k === "description" || k === "source_url")) {
      patch[k] = v;
    }
  }
  return patch;
}

/** ---------- main import ---------- */

export async function importCrmJson(
  supabase: any,
  ownerId: string | null,
  raw: unknown,
  opts: { dry_run?: boolean } = {},
): Promise<ImportReport> {
  const dry = !!opts.dry_run;
  const report: ImportReport = {
    ok: true,
    dry_run: dry,
    totals: {
      contacts_created: 0, contacts_updated: 0, contacts_merged: 0,
      properties_created: 0, properties_updated: 0, properties_merged: 0,
      rejected: 0, skipped: 0,
    },
    rows: [],
    errors: [],
  };

  if (!ownerId) {
    report.ok = false;
    report.errors.push("no_owner_context");
    return report;
  }

  const { contacts, properties } = extractRecordSets(raw);
  if (contacts.length === 0 && properties.length === 0) {
    report.ok = false;
    report.errors.push("no_recognizable_records");
    return report;
  }

  /* ---- contacts ---- */
  for (const rec of contacts.slice(0, 500)) {
    const { fields, notes, preferences } = mapContact(rec);
    const label = String(fields.full_name ?? fields.phone_number ?? "לקוח ללא שם");
    if (!fields.phone_number && !fields.full_name) {
      report.totals.rejected++;
      report.rows.push({ entity: "contact", label, action: "rejected", reason: "אין שם ואין טלפון" });
      continue;
    }
    try {
      let existing: any = null;
      if (fields.phone_number) {
        const { data } = await supabase
          .from("leads").select("*")
          .eq("assigned_to", ownerId).eq("phone_number", fields.phone_number).maybeSingle();
        existing = data ?? null;
      }
      if (!existing && fields.full_name) {
        const { data } = await supabase
          .from("leads").select("*")
          .eq("assigned_to", ownerId).ilike("full_name", fields.full_name).limit(1);
        existing = Array.isArray(data) ? data[0] ?? null : null;
      }

      if (existing) {
        const patch = mergePatch(existing, fields);
        if (preferences) {
          patch.preferences = { ...(existing.preferences ?? {}), ...preferences };
        }
        const changed = Object.keys(patch);
        if (changed.length === 0) {
          report.totals.skipped++;
          report.rows.push({ entity: "contact", label, action: "skipped", id: existing.id, reason: "אין נתון חדש" });
        } else {
          if (!dry) {
            const { error } = await supabase.from("leads").update(patch).eq("id", existing.id);
            if (error) throw error;
            if (notes) await addNote(supabase, ownerId, existing.id, null, notes);
          }
          report.totals.contacts_merged++;
          report.rows.push({ entity: "contact", label, action: "merged", id: existing.id, changed_fields: changed });
        }
        continue;
      }

      if (!fields.phone_number) {
        report.totals.rejected++;
        report.rows.push({ entity: "contact", label, action: "rejected", reason: "לקוח חדש חייב מספר טלפון" });
        continue;
      }
      let id: string | undefined;
      if (!dry) {
        const insert: Record<string, any> = {
          ...fields,
          assigned_to: ownerId,
          last_interaction_at: new Date().toISOString(),
        };
        if (preferences) insert.preferences = preferences;
        const { data, error } = await supabase.from("leads").insert(insert).select("id").maybeSingle();
        if (error) throw error;
        id = data?.id;
        if (notes && id) await addNote(supabase, ownerId, id, null, notes);
      }
      report.totals.contacts_created++;
      report.rows.push({ entity: "contact", label, action: "created", id });
    } catch (e) {
      report.totals.rejected++;
      report.rows.push({ entity: "contact", label, action: "rejected", reason: (e as Error).message });
    }
  }

  /* ---- properties ---- */
  for (const rec of properties.slice(0, 500)) {
    const { fields, owner } = mapProperty(rec);
    const label = String(fields.property_title ?? fields.address ?? "נכס ללא כתובת");
    if (!fields.property_title && !fields.address) {
      report.totals.rejected++;
      report.rows.push({ entity: "property", label, action: "rejected", reason: "אין כתובת ואין כותרת" });
      continue;
    }
    try {
      let existing: any = null;
      if (fields.external_id) {
        const { data } = await supabase
          .from("listings").select("*")
          .eq("user_id", ownerId).eq("external_id", fields.external_id).maybeSingle();
        existing = data ?? null;
      }
      if (!existing) {
        // Fuzzy dedupe: same normalized address (+city) regardless of punctuation.
        const key = addressKey(fields.address, fields.city);
        const { data } = await supabase
          .from("listings").select("*")
          .eq("user_id", ownerId).limit(1000);
        existing = (Array.isArray(data) ? data : []).find((row: any) => {
          const rowKey = addressKey(row.address ?? undefined, row.city ?? undefined);
          if (key && rowKey && rowKey === key) return true;
          if (fields.property_title && row.property_title &&
              addressKey(row.property_title) === addressKey(fields.property_title)) return true;
          return false;
        }) ?? null;
      }

      if (existing) {
        const patch = mergePatch(existing, fields);
        const changed = Object.keys(patch);
        if (changed.length === 0) {
          report.totals.skipped++;
          report.rows.push({ entity: "property", label, action: "skipped", id: existing.id, reason: "אין נתון חדש" });
        } else {
          if (!dry) {
            const { error } = await supabase.from("listings").update(patch).eq("id", existing.id);
            if (error) throw error;
          }
          report.totals.properties_merged++;
          report.rows.push({ entity: "property", label, action: "merged", id: existing.id, changed_fields: changed });
        }
      } else {
        let id: string | undefined;
        if (!dry) {
          const title = String(fields.property_title ?? fields.address);
          const insert: Record<string, any> = {
            user_id: ownerId,
            property_title: title,
            description: fields.description ?? "",
            asking_price: fields.asking_price ?? 0,
            slug: `${slugify(title)}-${Math.random().toString(36).slice(2, 7)}`,
            status: fields.status ?? "live",
            source: "manual",
            ...fields,
          };
          const { data, error } = await supabase.from("listings").insert(insert).select("id").maybeSingle();
          if (error) throw error;
          id = data?.id;
        }
        report.totals.properties_created++;
        report.rows.push({ entity: "property", label, action: "created", id });
      }

      // An owner contact attached to a property becomes a CRM card too.
      if (owner?.phone) {
        const phone = normalizeIlPhone(owner.phone);
        if (phone) {
          const { data: ex } = await supabase
            .from("leads").select("id")
            .eq("assigned_to", ownerId).eq("phone_number", phone).maybeSingle();
          if (!ex && !dry) {
            await supabase.from("leads").insert({
              assigned_to: ownerId,
              phone_number: phone,
              full_name: owner.name ?? null,
              city: fields.city ?? null,
              interest_tag: "בעל נכס",
              lead_stage: "new",
            });
          }
          if (!ex) {
            report.totals.contacts_created++;
            report.rows.push({
              entity: "contact",
              label: owner.name ?? phone,
              action: "created",
              reason: "בעל הנכס " + label,
            });
          }
        }
      }
    } catch (e) {
      report.totals.rejected++;
      report.rows.push({ entity: "property", label, action: "rejected", reason: (e as Error).message });
    }
  }

  return report;
}

async function addNote(
  supabase: any,
  ownerId: string,
  leadId: string | null,
  listingId: string | null,
  content: string,
) {
  try {
    await supabase.from("interaction_activity_log").insert({
      user_id: ownerId,
      thread_key: leadId ? `lead:${leadId}` : `owner:${ownerId}`,
      platform: "internal",
      action_type: "note",
      actor_type: "ai",
      actor_label: "ייבוא JSON",
      content,
      metadata: { lead_id: leadId, listing_id: listingId, source: "crm_json_import" },
    });
  } catch { /* non-fatal */ }
}

/** Short Hebrew summary of a report for the chat bubble. */
export function reportToHebrew(r: ImportReport): string {
  if (!r.ok) {
    return r.errors.includes("no_recognizable_records")
      ? "קראתי את הקובץ אבל לא זיהיתי בו רשומות של אנשי קשר או נכסים. שלח לי מבנה עם contacts / properties או מערך רשומות ואטפל בזה."
      : `ייבוא נכשל: ${r.errors.join(", ")}`;
  }
  const t = r.totals;
  const lines = [
    r.dry_run ? "סימולציית ייבוא (לא נשמר):" : "דוח ייבוא JSON:",
    `אנשי קשר: ${t.contacts_created} נוספו, ${t.contacts_merged} מוזגו/עודכנו`,
    `נכסים: ${t.properties_created} נוספו, ${t.properties_merged} מוזגו/עודכנו`,
    `דולגו: ${t.skipped} | נדחו: ${t.rejected}`,
  ];
  const rejected = r.rows.filter((x) => x.action === "rejected").slice(0, 10);
  if (rejected.length) {
    lines.push("", "רשומות שנדחו:");
    for (const x of rejected) lines.push(`- ${x.label}: ${x.reason ?? "לא ידוע"}`);
  }
  return lines.join("\n");
}
