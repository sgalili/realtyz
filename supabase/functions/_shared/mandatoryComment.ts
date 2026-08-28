/**
 * mandatoryComment
 * ----------------
 * HARD RULE: every post Realtyz publishes to Facebook (page or group, manual,
 * scheduled, recurring, queue-driven) MUST carry a first comment that contains
 * the official contact line and its tracking short link.
 *
 * Never remove the link, never point it at another number/domain.
 */
export const MANDATORY_COMMENT_LINK = "https://realtyz.co.il/r/94mp59n9";
export const MANDATORY_FIRST_COMMENT = `מוזמנים לפנות אליי: ${MANDATORY_COMMENT_LINK}`;

/**
 * Returns the first comment that must be posted: the broker's own text with
 * the mandatory contact line appended (or the line alone when there is none).
 */
export function ensureMandatoryComment(text: string | null | undefined): string {
  const base = String(text ?? "").trim();
  if (!base) return MANDATORY_FIRST_COMMENT;
  if (base.includes(MANDATORY_COMMENT_LINK)) return base;
  // Strip any other legacy WhatsApp CTA line so we never ship two links.
  const cleaned = base
    .split(/\n+/)
    .filter((line) => !/(wa\.me\/|api\.whatsapp\.com|realtyz\.co\.il\/r\/)/i.test(line))
    .join("\n")
    .trim();
  return cleaned ? `${cleaned}\n\n${MANDATORY_FIRST_COMMENT}` : MANDATORY_FIRST_COMMENT;
}
