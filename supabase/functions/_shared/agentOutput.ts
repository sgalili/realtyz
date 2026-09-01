/**
 * Agent output guard.
 *
 * The model sometimes emits its structured action envelope (or a fenced
 * ```json block) mixed into prose instead of returning clean JSON. Those blobs
 * must NEVER reach the web chat or WhatsApp. This module:
 *
 *   1. extracts every action envelope from raw model output (fenced or inline),
 *   2. hard-strips any leftover JSON / code block from the user-facing text,
 *   3. builds a clean Hebrew summary report of what was executed server-side.
 */

const HEB_FALLBACK = "הפעולות בוצעו בהצלחה.";

/** Walk the string and return every balanced top-level {...} / [...] blob. */
function jsonBlobs(text: string): { raw: string; value: unknown }[] {
  const out: { raw: string; value: unknown }[] = [];
  const s = String(text ?? "");
  for (let i = 0; i < s.length; i++) {
    const open = s[i];
    if (open !== "{" && open !== "[") continue;
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) {
          const raw = s.slice(i, j + 1);
          try {
            out.push({ raw, value: JSON.parse(raw) });
          } catch { /* not JSON — ignore */ }
          i = j;
          break;
        }
      }
    }
  }
  return out;
}

function isAction(v: unknown): boolean {
  return !!v && typeof v === "object" && !Array.isArray(v) &&
    typeof (v as Record<string, unknown>).kind === "string";
}

export type ExtractedEnvelope = {
  /** All CRM actions found anywhere in the output. */
  actions: Record<string, unknown>[];
  /** Human text the model meant for the owner (envelope `content` or prose). */
  content: string;
};

/**
 * Pull action envelopes out of raw model output, even when they are wrapped in
 * prose or code fences. Returns the actions plus the cleaned human text.
 */
export function extractActionEnvelopes(raw: string): ExtractedEnvelope {
  const text = String(raw ?? "");
  const actions: Record<string, unknown>[] = [];
  const contents: string[] = [];
  let residual = text;

  for (const blob of jsonBlobs(text)) {
    const v = blob.value as any;
    let matched = false;
    if (Array.isArray(v) && v.length && v.every(isAction)) {
      actions.push(...v);
      matched = true;
    } else if (v && typeof v === "object") {
      if (Array.isArray(v.actions) && v.actions.some(isAction)) {
        actions.push(...v.actions.filter(isAction));
        matched = true;
      } else if (isAction(v)) {
        actions.push(v);
        matched = true;
      }
      if (matched && typeof v.content === "string" && v.content.trim()) {
        contents.push(v.content.trim());
      }
    }
    if (matched) residual = residual.replace(blob.raw, " ");
  }

  const prose = stripRawJson(residual);
  const content = contents.join("\n").trim() || prose;
  return { actions, content };
}

/**
 * Hard guard: remove any code fence, JSON blob or internal action schema from
 * text that is about to be shown to a human.
 */
export function stripRawJson(raw: string | null | undefined): string {
  let text = String(raw ?? "");
  // Fenced blocks: drop them entirely when the body looks like JSON/code.
  text = text.replace(/```[a-zA-Z]*\s*([\s\S]*?)```/g, (_m, inner) => {
    const body = String(inner).trim();
    return /^[[{]/.test(body) || /"(kind|actions|type|query)"\s*:/.test(body) ? " " : body;
  });
  text = text.replace(/^```[a-zA-Z]*\s*/i, "").replace(/```$/g, "");
  // Bare JSON blobs left in prose.
  for (const blob of jsonBlobs(text)) {
    if (/"(kind|actions|lead_id|listing_id|query|type)"\s*:/.test(blob.raw) || /^[[{]\s*[[{]?/.test(blob.raw)) {
      text = text.replace(blob.raw, " ");
    }
  }
  // Leftover schema fragments / escaped newlines.
  text = text.replace(/"\s*(kind|actions|lead_id|listing_id)\s*"\s*:\s*/gi, " ");
  text = text.replace(/\\r\\n|\\n/g, "\n").replace(/\\"/g, '"');
  return text
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, "").replace(/^[ \t]+/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** True when the text still contains raw JSON / code that a human must not see. */
export function looksLikeRawPayload(text: string): boolean {
  const s = String(text ?? "");
  if (/```/.test(s)) return true;
  return /"(kind|actions)"\s*:/.test(s);
}

export type ExecResult = { kind: string; ok: boolean; error?: string };

const KIND_LABELS: Record<string, [string, string]> = {
  create_contact: ["נוסף איש קשר", "נוספו אנשי קשר"],
  update_contact: ["עודכן איש קשר", "עודכנו אנשי קשר"],
  delete_contact: ["נמחק איש קשר", "נמחקו אנשי קשר"],
  merge_contacts: ["אוחדו כרטיסים", "אוחדו כרטיסים"],
  create_property: ["נוסף נכס", "נוספו נכסים"],
  update_property: ["עודכן נכס", "עודכנו נכסים"],
  delete_property: ["נמחק נכס", "נמחקו נכסים"],
  create_note: ["נשמרה הערה", "נשמרו הערות"],
  log_call: ["תועדה שיחה", "תועדו שיחות"],
  create_reminder: ["נקבעה תזכורת", "נקבעו תזכורות"],
  create_task: ["נפתחה משימה", "נפתחו משימות"],
  complete_task: ["הושלמה משימה", "הושלמו משימות"],
  delete_task: ["נמחקה משימה", "נמחקו משימות"],
  import_json: ["בוצע ייבוא", "בוצעו ייבואים"],
};

/** Clean Hebrew report of what actually happened in the database. */
export function summarizeCrmResults(results: ExecResult[]): string {
  const ok = results.filter((r) => r.ok);
  const counts = new Map<string, number>();
  for (const r of ok) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  const parts: string[] = [];
  for (const [kind, n] of counts) {
    const label = KIND_LABELS[kind];
    parts.push(label ? `${n === 1 ? label[0] : label[1]}: ${n}` : `${kind}: ${n}`);
  }
  if (!parts.length) return "";
  return `הפעולות בוצעו בהצלחה. ${parts.join(", ")}.`;
}

export { HEB_FALLBACK as ACTIONS_DONE_FALLBACK_HE };
