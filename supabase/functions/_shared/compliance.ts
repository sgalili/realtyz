/**
 * Compliance helpers shared by all outbound functions.
 *
 * - DISCLOSURE_FOOTER_HE: subtle Hebrew "AI-assisted content" tag appended to
 *   public-facing AI-generated messages where law requires disclosure.
 * - appendDisclosure(text, enabled): idempotently appends the footer.
 */

export const DISCLOSURE_FOOTER_HE = ", תוכן בסיוע AI";
export const DISCLOSURE_FOOTER_EN = ", AI-assisted content";

export function appendDisclosure(
  text: string,
  enabled: boolean,
  language: "he" | "en" = "he",
): { text: string; appended: boolean } {
  if (!enabled || !text) return { text, appended: false };
  const footer = language === "en" ? DISCLOSURE_FOOTER_EN : DISCLOSURE_FOOTER_HE;
  // Idempotent, don't double-append.
  if (text.trimEnd().endsWith(footer)) return { text, appended: true };
  return { text: `${text.trimEnd()}\n\n${footer}`, appended: true };
}
