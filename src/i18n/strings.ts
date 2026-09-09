// Locale-aware micro-strings for loading/status UI in the campaigns feed.
// Reads `kalpiz_locale` from localStorage; defaults to Hebrew (he).
// STRICT: never use the forbidden Hebrew tokens 'ליד'/'לידים' — always
// use 'איש קשר'/'אנשי קשר' when referring to platform contacts.

export type Locale = "he" | "en";

export const getLocale = (): Locale => {
  try {
    if (typeof window === "undefined") return "he";
    const v = window.localStorage.getItem("kalpiz_locale");
    return v === "en" ? "en" : "he";
  } catch {
    return "he";
  }
};

type Dict = Record<string, { he: string; en: string }>;

const DICT: Dict = {
  loadingCommentTree: {
    he: "טוען את עץ התגובות…",
    en: "Loading full comment tree…",
  },
  loadingCommentTreeWithCount: {
    he: "טוען את עץ התגובות המלא ({count})…",
    en: "Loading full comment tree ({count})…",
  },
  noCommentsYet: {
    he: "אין תגובות עדיין לקמפיין זה",
    en: "No comments yet for this campaign",
  },
  fbSessionExpiredTitle: {
    he: "חיבור פייסבוק זמני פקע",
    en: "Facebook session expired",
  },
  fbSessionExpiredBody: {
    he: "יש לחדש את החיבור דרך הגדרות הערוצים. תגובות שכבר נטענו מוצגות מהזיכרון המקומי.",
    en: "Please reconnect Facebook from channel settings. Previously loaded comments are shown from local cache.",
  },
  providerBlocked: {
    he: "החיבור לפייסבוק חסום כרגע: {reason}",
    en: "Facebook connection is temporarily blocked: {reason}",
  },
  refreshFailed: {
    he: "רענון נכשל",
    en: "Refresh failed",
  },
  commentLoadFailed: {
    he: "טעינת תגובות נכשלה",
    en: "Failed to load comments",
  },
};

export const t = (key: keyof typeof DICT, vars: Record<string, string | number> = {}): string => {
  const entry = DICT[key];
  const raw = entry ? entry[getLocale()] : String(key);
  return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
};
