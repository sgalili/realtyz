// Facebook DOM scrapes sometimes capture the member line or a notification
// instead of the group's title. These helpers recover the real name/count.
const MARKS = /[\u200e\u200f\u202a-\u202e]/g;
const MEMBER_LINE = /^\s*([\d.,]+)\s*([KkMm]|אלף|מיליון)?\s*(?:חברים|members)/;

export function memberCountFromText(value: string | null | undefined): number | null {
  const m = String(value ?? '').replace(MARKS, '').match(MEMBER_LINE);
  if (!m) return null;
  const unit = (m[2] || '').toLowerCase();
  const factor = unit === 'm' || unit === 'מיליון' ? 1_000_000 : unit === 'k' || unit === 'אלף' ? 1_000 : 1;
  const n = Math.round(Number(m[1].replace(/,/g, '')) * factor);
  return Number.isFinite(n) ? n : null;
}

/** Returns a clean group title, or null when the scraped text is not a title. */
export function cleanGroupName(value: string | null | undefined): string | null {
  const text = String(value ?? '').replace(MARKS, '').replace(/\s+/g, ' ').trim();
  if (!text || MEMBER_LINE.test(text)) return null;
  const quoted = text.match(/["“״]([^"”״]{2,})["”״]/);
  if (quoted && /בקבוצה|group/i.test(text)) return quoted[1].replace(/\.{3}$|…$/, '').trim();
  return text;
}
