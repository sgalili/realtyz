/**
 * Compliance helpers shared by all outbound functions.
 *
 * STRICT POLICY (Udi): the AI-assisted watermark is FORBIDDEN on every
 * outbound message. The footer constants are kept as empty strings so any
 * legacy caller of appendDisclosure() becomes a no-op (and any previously
 * appended watermark is actively stripped by stripDisclosure()).
 */

export const DISCLOSURE_FOOTER_HE = "";
export const DISCLOSURE_FOOTER_EN = "";

const WATERMARK_RE = /[,،]?\s*(?:תוכן\s*בסיוע\s*AI|AI[- ]assisted\s*content)\s*/giu;

export function stripDisclosure(text: string): string {
  if (!text) return text;
  return text.replace(WATERMARK_RE, "").replace(/\n{3,}/g, "\n\n").replace(/\s+$/g, "");
}

export function appendDisclosure(
  text: string,
  _enabled: boolean,
  _language: "he" | "en" = "he",
): { text: string; appended: boolean } {
  // Watermark is permanently disabled. Strip any pre-existing instance so
  // upstream drafts that already contained it come out clean.
  return { text: stripDisclosure(text ?? ""), appended: false };
}

