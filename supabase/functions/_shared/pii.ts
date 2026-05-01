/**
 * PII masker — used to scrub personally-identifiable information from text
 * BEFORE it is sent to the LLM. We keep enough context for the model to
 * understand the conversation (e.g. "[ID]", "[CARD]") without leaking the
 * raw value. Originals stay untouched in the database.
 *
 * Patterns covered:
 *  - Israeli ID numbers (9 digits, with simple length heuristic)
 *  - Credit card numbers (13–19 digits, with optional spaces/dashes)
 *  - Israeli IBAN (IL + 2 + 19 digits)
 *  - Email addresses
 *  - Phone numbers (international + local Israeli)
 */

export type PiiKind = "id" | "card" | "iban" | "email" | "phone";

const PATTERNS: Array<{ kind: PiiKind; re: RegExp; placeholder: string }> = [
  // Israeli IBAN
  { kind: "iban", re: /\bIL\d{2}\d{19}\b/gi, placeholder: "[IBAN]" },
  // Credit card (13–19 digits, allow spaces or dashes between groups)
  {
    kind: "card",
    re: /\b(?:\d[ -]*?){13,19}\b/g,
    placeholder: "[CARD]",
  },
  // Email
  {
    kind: "email",
    re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    placeholder: "[EMAIL]",
  },
  // Israeli phone (e.g. 050-1234567, 0501234567, +972501234567, 972501234567)
  {
    kind: "phone",
    re: /(?:\+?972[-\s]?|0)5\d[-\s]?\d{3}[-\s]?\d{4}/g,
    placeholder: "[PHONE]",
  },
  // Generic international phone (8–15 digits with +)
  {
    kind: "phone",
    re: /\+\d[\d\s-]{7,14}\d/g,
    placeholder: "[PHONE]",
  },
  // Israeli national ID — 9 digits, not part of a longer number.
  // We deliberately put this AFTER credit cards so longer sequences match first.
  { kind: "id", re: /(?<!\d)\d{9}(?!\d)/g, placeholder: "[ID]" },
];

export interface PiiMaskResult {
  text: string;
  hits: Record<PiiKind, number>;
}

export function maskPii(input: string | null | undefined): PiiMaskResult {
  const hits: Record<PiiKind, number> = {
    id: 0,
    card: 0,
    iban: 0,
    email: 0,
    phone: 0,
  };
  if (!input) return { text: "", hits };

  let out = String(input);
  for (const { kind, re, placeholder } of PATTERNS) {
    out = out.replace(re, () => {
      hits[kind] += 1;
      return placeholder;
    });
  }
  return { text: out, hits };
}

/** Apply maskPii to every string in a chat-style messages array. */
export function maskMessages<T extends { content?: unknown }>(
  messages: T[],
): { messages: T[]; hits: Record<PiiKind, number> } {
  const totals: Record<PiiKind, number> = {
    id: 0,
    card: 0,
    iban: 0,
    email: 0,
    phone: 0,
  };
  const masked = messages.map((m) => {
    if (typeof m.content !== "string") return m;
    const r = maskPii(m.content);
    (Object.keys(totals) as PiiKind[]).forEach((k) => (totals[k] += r.hits[k]));
    return { ...m, content: r.text };
  });
  return { messages: masked, hits: totals };
}
