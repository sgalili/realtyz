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
  "תבנית חובה (פוסט נכס מקצועי ועשיר — אסור פוסט קצר או גנרי):",
  "- כל שורה מתחילה באמוג'י אחד בלבד, ואחריו רווח ואז הטקסט.",
  "- אסור בהחלט שני אמוג'ים זה לצד זה (למשל ✨🏡). אמוג'י אחד לכל שורה, לכל היותר.",
  "- פלטה: 🏡 ✨ 🏢 🛗 🚗 💰 📍 📐 💫 🌤️ 🛏️ 🧱 ❄️ 🛡️ 🔑.",
  "- מבנה: 🏡 הוק כותרת (סוג עסקה + סוג נכס + חדרים + רחוב + שכונה + עיר), 📐 שורת מ\"ר | חדרים | קומה, 4-8 שורות בולט פיצ'רים שממחות כל פיצ'ר/מרפסת/חניה/מחסן/מעלית/מיזוג/כיווני אוויר/נוף/ממ\"ד שקיימים, 📍 מיקום ונגישות, 💫 לייף-סטייל, 💰 מחיר מבוקש.",
  "- מינימום 8 שורות תוכן, מתוכן לפחות 4 שורות פיצ'רים.",
  "- בלי האשטגים, בלי סוגריים מרובעים, בלי מספר בית בכתובת, בלי הצגה עצמית, בלי בולטים של ✅ או מקפים.",
  "- אל תכתוב חתימה/טלפון/רישיון — המערכת מוסיפה את בלוק החתימה של בעל החשבון אוטומטית.",
].join("\n");

/**
 * Prompt law shared by EVERY generator (all channels, all templates):
 * each pain-point / benefit / punch line opens with ONE relevant emoji bullet.
 */
export const EMOJI_BULLET_LAW = [
  "EMOJI BULLET LAW (all channels, mandatory):",
  "- כל שורת תוכן פותחת באמוג'י אחד רלוונטי, אחריו רווח ואז הטקסט. האמוג'י הוא הבולט.",
  "- שורות כאב (הבעיה של הקורא) פותחות באמוג'י כאב: ⏳ ⚠️ 😤 📉 📵 🕐.",
  "- שורות תועלת/פתרון פותחות באמוג'י תועלת: ✅ ⚡ 🤖 📈 💬 🎯 🧠 🗂️.",
  "- שורת מחיר 💰, שורת מיקום 📍, שורת נתונים 📐, שורת הזמנה לפעולה 📅.",
  "- אמוג'י אחד לכל שורה בלבד — אסור שני אמוג'ים זה לצד זה, אסור לחזור על אותו אמוג'י פעמיים.",
  "- אסור ✅ כשורת כאב, אסור בולטים של '-' או '•', אסור אמוג'י הייפ (🔥 💯 🎉 🌟 💎 🙌 🤩 ⭐).",
  "- שורה ריקה מלאה בין שורה לשורה, כדי שהשורות לא ייצמדו.",
].join("\n");

const PAIN_EMOJI = "⏳";
const BENEFIT_EMOJI = "✅";

const LINE_EMOJI_RULES: { re: RegExp; emoji: string }[] = [
  { re: /(מחיר|עלות|שקל|₪|תמחור|חבילה)/, emoji: "💰" },
  { re: /(כתובת|שכונ|עיר|מיקום|נגישות|תחבורה)/, emoji: "📍" },
  { re: /(מ"ר|מ״ר|חדרים|קומה|שטח)/, emoji: "📐" },
  { re: /(זום|פגישה|נקבע|יומן|15 דקות|הדגמה|דמו|לתאום|לתיאום)/, emoji: "📅" },
  { re: /(וואטסאפ|ווטסאפ|whatsapp|הודע|שיחה|צ'אט)/, emoji: "💬" },
  { re: /(אוטומט|אוטומצי|בוט|AI|מענה אוטומטי)/, emoji: "🤖" },
  { re: /(חוסך|חיסכון|מהיר|תוך שניות|מיד)/, emoji: "⚡" },
  { re: /(גדל|יותר עסקאות|הכנס|תשואה|צמיח|המרות)/, emoji: "📈" },
  // pain signals
  { re: /(מפספס|נשרפ|אבד|מתפספס|לא ענ|בלי מענה|נשאר על הרצפה|מפוזר|בלגן|ידני|שוכח)/, emoji: PAIN_EMOJI },
  { re: /(שעות|כל היום|עומס|מתיש|רץ בין)/, emoji: "🕐" },
  { re: /(בעיה|קשה מדי|נכשל|טועה|סיכון)/, emoji: "⚠️" },
];

/**
 * Deterministic safety net: guarantees every content line starts with exactly
 * one relevant emoji bullet, even when the model forgets.
 */
export function ensureLeadingEmojiBullets(
  input: string | null | undefined,
  opts: { skip?: RegExp } = {},
): string {
  const text = enforceSingleEmojis(input);
  if (!text) return "";
  const leading = new RegExp(`^\\s*(?:${EMOJI_RE.source})`, "u");
  const skip = opts.skip;

  return text
    .split("\n")
    .map((raw) => {
      const line = raw.trim();
      if (!line) return line;
      if (leading.test(line)) return line;
      if (skip && skip.test(line)) return line;
      // never decorate signatures / contact / license / bare URLs
      if (/^(https?:\/\/|רישיון|טלפון|נייד|\+?\d[\d\-\s]{6,})/.test(line)) return line;
      const rule = LINE_EMOJI_RULES.find((r) => r.re.test(line));
      const emoji = rule?.emoji ?? (/[?？]\s*$/.test(line) ? PAIN_EMOJI : BENEFIT_EMOJI);
      return `${emoji} ${line}`;
    })
    .join("\n");
}
