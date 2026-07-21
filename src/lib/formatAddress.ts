// LAW #1 mirror: strip building/house/apartment numbers from any street
// address before display or before it ships to an AI prompt. Keeps the
// street name intact and never touches unit values (חדרים, מ"ר, קומה, ₪, %).
// Handles multi-token tails like "אריה לייב יפה 36 2" → "אריה לייב יפה".
export function stripAddressNumbers(value: unknown): string {
  let s = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return s;
  const UNIT = /(?:חדרים|חדר|מ["׳']?\s*ר|מטר|מ['׳]|קומה|קומות|דקות|שעות|שנה|שנים|אחוז|%|₪|ש["׳']?\s*ח|דולר|\$|€)/;
  const wordDigit = /(^|[^\d:=״"׳'])([\u0590-\u05FF]{2,}(?:[\u0590-\u05FF״"׳'-]*[\u0590-\u05FF])?)\s+(\d{1,4})[א-ת]?(?=\s|,|$)/;
  for (let i = 0; i < 6; i++) {
    const next = s.replace(wordDigit, (m, pre, word, _num, offset, full) => {
      const after = String(full).slice(offset + m.length, offset + m.length + 24);
      if (UNIT.test(after.trim())) return m;
      if (/^(שנת|שנה|גיל|טלפון|נייד|מספר|דירה|קומה|בנין|בניין|פרויקט|פרוייקט|בן|בת)$/.test(word)) return m;
      return `${pre}${word}`;
    });
    if (next === s) break;
    s = next;
  }
  return s.replace(/\s+,/g, ',').replace(/[ \t]{2,}/g, ' ').trim();
}
