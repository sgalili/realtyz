/**
 * Client-side PII masker — mirrors `supabase/functions/_shared/pii.ts`.
 * Used to scrub personally-identifiable information before persisting
 * free-text content to long-lived stores like the Strategy Bank
 * (knowledge_documents) and Deal Room (deal_room_comments).
 *
 * Patterns covered:
 *  - Israeli ID numbers (9 digits)
 *  - Credit card numbers (13–19 digits, optional spaces/dashes)
 *  - Israeli IBAN
 *  - Email addresses
 *  - Phone numbers (international + local Israeli)
 */

export type PiiKind = "id" | "card" | "iban" | "email" | "phone";

const PATTERNS: Array<{ kind: PiiKind; re: RegExp; placeholder: string }> = [
  { kind: "iban", re: /\bIL\d{2}\d{19}\b/gi, placeholder: "[IBAN]" },
  { kind: "card", re: /\b(?:\d[ -]*?){13,19}\b/g, placeholder: "[CARD]" },
  { kind: "email", re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, placeholder: "[EMAIL]" },
  { kind: "phone", re: /(?:\+?972[-\s]?|0)5\d[-\s]?\d{3}[-\s]?\d{4}/g, placeholder: "[PHONE]" },
  { kind: "phone", re: /\+\d[\d\s-]{7,14}\d/g, placeholder: "[PHONE]" },
  // Israeli national ID — 9 digits not part of a longer number. Keep AFTER cards.
  { kind: "id", re: /(?<!\d)\d{9}(?!\d)/g, placeholder: "[ID]" },
];

export interface PiiMaskResult {
  text: string;
  hits: Record<PiiKind, number>;
  hasPii: boolean;
}

export function maskPii(input: string | null | undefined): PiiMaskResult {
  const hits: Record<PiiKind, number> = { id: 0, card: 0, iban: 0, email: 0, phone: 0 };
  if (!input) return { text: "", hits, hasPii: false };

  let out = String(input);
  for (const { kind, re, placeholder } of PATTERNS) {
    out = out.replace(re, () => {
      hits[kind] += 1;
      return placeholder;
    });
  }
  const hasPii = (Object.values(hits) as number[]).some((n) => n > 0);
  return { text: out, hits, hasPii };
}

export function summarizeHits(hits: Record<PiiKind, number>): string {
  const labels: Record<PiiKind, string> = {
    id: "ת.ז.",
    card: "כרטיסי אשראי",
    iban: "IBAN",
    email: "אימיילים",
    phone: "טלפונים",
  };
  return (Object.keys(hits) as PiiKind[])
    .filter((k) => hits[k] > 0)
    .map((k) => `${labels[k]} ×${hits[k]}`)
    .join(", ");
}
