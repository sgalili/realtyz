// Shared emoji hygiene for every generated / dispatched post.
//
// HARD RULE (product): a post may never place two emojis directly next to each
// other (e.g. "✨🏡"). Each bullet / heading carries exactly ONE emoji, cleanly
// separated from the text.

const EMOJI_RE =
  /(?:\p{Extended_Pictographic}(?:\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?)*)/gu;

/**
 * Collapses any run of adjacent emojis (with or without spaces between them)
 * down to the FIRST emoji of the run, and guarantees a single space between
 * that emoji and the following text.
 */
export function enforceSingleEmojis(input: string | null | undefined): string {
  const text = String(input ?? "");
  if (!text) return "";

  const cleaned = text.replace(
    new RegExp(`(${EMOJI_RE.source})(?:[ \\t]*(?:${EMOJI_RE.source}))+`, "gu"),
    "$1",
  );

  return cleaned
    // no emoji glued to the next word
    .replace(new RegExp(`(${EMOJI_RE.source})(?=[^\\s\\p{P}])`, "gu"), "$1 ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Style contract appended to every regeneration prompt for scheduled posts. */
export const RICH_TEMPLATE_CONTRACT = [
  "תבנית חובה (פוסט נכס מקצועי ועשיר):",
  "- כל שורת בולט מתחילה באמוג'י אחד בלבד, ואחריו רווח ואז הטקסט.",
  "- אסור בהחלט שני אמוג'ים זה לצד זה (למשל ✨🏡). אמוג'י אחד לכל שורה, לכל היותר.",
  "- מבנה: הוק כותרת עם 🏡, 1-2 שורות תיאור מדויקות, 🌇 שורת מיקום, 💫 שורת לייף-סטייל, ולסיום שורת מחיר + 📞 הזמנה ליצירת קשר.",
  "- בלי האשטגים, בלי סוגריים מרובעים, בלי מספר בית בכתובת, בלי הצגה עצמית.",
].join("\n");
