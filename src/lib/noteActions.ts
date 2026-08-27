/**
 * Smart note parsing: turns a free-text agent note into a suggested follow-up
 * task (title + due date + category). Hebrew-first, with English fallbacks.
 */

export type NoteCategory = 'call' | 'message' | 'showing' | 'note' | 'offer' | 'meeting';

export const NOTE_CATEGORY_LABEL: Record<NoteCategory, string> = {
  call: 'שיחת טלפון',
  message: 'הודעה',
  showing: 'סיור בנכס',
  meeting: 'פגישה',
  offer: 'הצעה / מו״מ',
  note: 'הערה',
};

export type SuggestedAction = {
  title: string;
  dueAt: Date;
  category: NoteCategory;
  reason: string;
};

const CALL_HINTS = ['להתקשר', 'שיחה', 'טלפון', 'חזרתי אליו', 'call', 'phone'];
const SHOWING_HINTS = ['סיור', 'ביקור', 'להראות', 'תצוגה', 'showing', 'visit'];
const MEETING_HINTS = ['פגישה', 'ניפגש', 'meeting'];
const OFFER_HINTS = ['הצעה', 'מו״מ', 'משא ומתן', 'מחיר', 'offer'];
const MESSAGE_HINTS = ['וואטסאפ', 'הודעה', 'מייל', 'whatsapp', 'message', 'email'];

const FOLLOW_UP_HINTS = [
  'לחזור', 'מעקב', 'לתאם', 'לשלוח', 'להתקשר', 'לבדוק', 'לעדכן', 'להזכיר',
  'צריך', 'לקבוע', 'follow up', 'followup', 'remind', 'send', 'check',
];

function hasAny(text: string, list: string[]) {
  return list.some((k) => text.includes(k));
}

export function detectNoteCategory(text: string): NoteCategory {
  const t = text.toLowerCase();
  if (hasAny(t, SHOWING_HINTS)) return 'showing';
  if (hasAny(t, MEETING_HINTS)) return 'meeting';
  if (hasAny(t, OFFER_HINTS)) return 'offer';
  if (hasAny(t, CALL_HINTS)) return 'call';
  if (hasAny(t, MESSAGE_HINTS)) return 'message';
  return 'note';
}

const HE_NUMBERS: Record<string, number> = {
  יום: 1, יומיים: 2, שלושה: 3, שלוש: 3, ארבעה: 4, ארבע: 4, חמישה: 5, חמש: 5,
  שישה: 6, שש: 6, שבעה: 7, שבע: 7, עשרה: 10, עשר: 10,
};

function atHour(base: Date, hour: number) {
  const d = new Date(base);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** Extracts an explicit or implied due date from the note text. */
export function extractDueDate(text: string, now = new Date()): { date: Date; reason: string } {
  const t = text.toLowerCase();

  // Explicit clock time (e.g. 16:30 / ב-9:00)
  const timeMatch = t.match(/(\d{1,2}):(\d{2})/);

  const dayShift = (days: number, reason: string) => {
    const base = new Date(now.getTime() + days * 86_400_000);
    let d = atHour(base, 10);
    if (timeMatch) {
      d = new Date(base);
      d.setHours(Math.min(23, Number(timeMatch[1])), Number(timeMatch[2]), 0, 0);
    }
    return { date: d, reason };
  };

  if (t.includes('מחר')) return dayShift(1, 'זוהה "מחר" בטקסט');
  if (t.includes('מחרתיים')) return dayShift(2, 'זוהה "מחרתיים" בטקסט');
  if (t.includes('היום') || t.includes('today')) {
    const d = timeMatch
      ? (() => { const x = new Date(now); x.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0); return x; })()
      : new Date(now.getTime() + 3 * 3600_000);
    return { date: d, reason: 'זוהה "היום" בטקסט' };
  }
  if (t.includes('שבוע הבא') || t.includes('next week')) return dayShift(7, 'זוהה "שבוע הבא"');
  if (t.includes('בשבוע') || t.includes('עוד שבוע')) return dayShift(7, 'זוהה טווח של שבוע');
  if (t.includes('חודש')) return dayShift(30, 'זוהה טווח של חודש');

  const inDays = t.match(/(?:בעוד|עוד)\s+(\d+)\s*(?:ימים|יום)/);
  if (inDays) return dayShift(Number(inDays[1]), `זוהה "בעוד ${inDays[1]} ימים"`);

  for (const [word, n] of Object.entries(HE_NUMBERS)) {
    if (t.includes(`עוד ${word}`) || t.includes(`בעוד ${word}`)) {
      return dayShift(n, `זוהה טווח של ${n} ימים`);
    }
  }

  const inHours = t.match(/(?:בעוד|עוד)\s+(\d+)\s*(?:שעות|שעה)/);
  if (inHours) return { date: new Date(now.getTime() + Number(inHours[1]) * 3600_000), reason: 'זוהה טווח בשעות' };

  if (timeMatch) {
    const d = new Date(now);
    d.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
    if (d.getTime() < now.getTime()) d.setDate(d.getDate() + 1);
    return { date: d, reason: 'זוהתה שעה מדויקת בטקסט' };
  }

  // Default: next business morning
  return { date: atHour(new Date(now.getTime() + 86_400_000), 10), reason: 'ברירת מחדל: מחר בבוקר' };
}

function firstSentence(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const cut = clean.split(/[.!?\n]/)[0] ?? clean;
  return (cut.length > 3 ? cut : clean).slice(0, 90);
}

/** Returns a suggested follow-up task when the note implies one. */
export function extractNoteAction(text: string, now = new Date()): SuggestedAction | null {
  const raw = text.trim();
  if (raw.length < 4) return null;
  const t = raw.toLowerCase();
  const category = detectNoteCategory(raw);
  const impliesFollowUp = hasAny(t, FOLLOW_UP_HINTS) || /מחר|מחרתיים|שבוע הבא|בעוד\s+\d/.test(t);
  if (!impliesFollowUp) return null;

  const { date, reason } = extractDueDate(raw, now);
  const prefix =
    category === 'call' ? 'להתקשר' :
    category === 'showing' ? 'לתאם סיור' :
    category === 'meeting' ? 'לתאם פגישה' :
    category === 'offer' ? 'לקדם הצעה' :
    category === 'message' ? 'לשלוח הודעה' : 'מעקב';

  return {
    title: `${prefix}: ${firstSentence(raw)}`.slice(0, 120),
    dueAt: date,
    category,
    reason,
  };
}
