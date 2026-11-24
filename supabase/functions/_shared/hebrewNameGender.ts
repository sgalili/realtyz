/** Hebrew first-name gender classifier. Unisex or unknown names stay 'unknown'; manual choices always win (callers only fill empty genders). */
export type DetectedGender = 'male' | 'female' | 'unknown';
export interface GenderClassificationResult { gender: DetectedGender; confidence: 'high' | 'medium' | 'ambiguous'; matchedName?: string }

const MALE = new Set('אבי אברהם אדם אדיר אוהד אופק אורי אייל איתן אלון אלי אליאב אליהו אלעד אמיר אסף ארי ארז אריק אשר בועז ברוך בני בנימין בר ברק גדי גור גיא גלעד דב דביר דוד דור דורון דן דני הראל זיו חגי חיים יגאל יהודה יהונתן יונתן יוסי יורם יוסף יריב ישי ישראל כפיר מאור מאיר מיכאל מנחם משה מתן נדב נהוראי ניסן ניר נתן נתנאל עוז עופר עידו עידן עילאי עמרי ענר ערן פז צבי צור רונן רועי רן רפאל שגיא שגיב שון שלומי שלום שמעון שמואל תומר תמיר'.split(' '));
const FEMALE = new Set(['אביגיל','אביטל','אביה','אדווה','אדוה','אהובה','אודליה','אופירה','אורית','אורלי','אורנה','איילה','אילה','אילנית','אילת','אינה','אירית','אלה','אלינה','אלישבע','אלכסנדרה','אמונה','אמילי','אסתר','אפרת','אריאלה','אתי','בטי','בלה','ברכה','בת אל','בת שבע','בתיה','גאולה','גילה','גלית','דבורה','דינה','דליה','דנה','דניאלה','דפנה','הדס','הדסה','הילה','ורד','ורדה','זהבה','זיוה','זיווה','חגית','חדווה','חווה','חיה','חנה','טובה','טלי','טליה','יאנה','יהודית','יוליה','יונה','יונית','יסמין','יעל','יפה','יפעת','ירדנה','כרמל','כרמלה','לאה','ליאת','ליזה','לילך','לימור','לינה','לירז','מאיה','מגי','מזל','מיכל','מילה','מינה','מירי','מלאני','מלכה','מרים','מעיין','מרינה','מרגלית','מרלן','מתוקה','נאווה','נאוה','נטלי','נטע','ניבה','נילי','נינה','ניצן','ננה','נעמה','נעמי','נרי','נתנאלה','סופיה','סיגל','סיגלית','סיון','סימונה','סיוון','סלינה','סמדר','עדנה','עופרה','עזיזה','עליזה','ענבל','ענת','עדינה','פנינה','צביה','ציפי','ציפורה','רחל','ריטה','רינה','רינת','רוחמה','רוית','רומי','רונית','רות','רותי','רעות','רפאלה','רקפת','שולמית','שוש','שושנה','שירה','שירלי','שלומית','שלי','שרה','שרית','תאיר','תהילה','תמר','תקווה']);
const UNISEX = new Set('אביב אור אופיר אריאל גלי דניאל הדר זוהר זהר חן ים ירדן לידור לירון מור נועם נועה ניב עדי עומר עמית פלג רון רותם רז שחר שי שיר שרון תום טל ליאור יובל'.split(' '));
const TITLES = new Set(['עוד', 'דר', 'עו', 'ד', 'אדריכל', 'מתווך', 'מתווכת', 'מר', 'גב', 'גברת', 'הרב']);

export function extractFirstName(full?: string | null): string {
  const parts = String(full ?? '').replace(/["'״׳()[\]{}.,!?:/\\\-–—_]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const i = parts.findIndex(p => !TITLES.has(p));
  if (i < 0) return '';
  const two = parts[i + 1] ? `${parts[i]} ${parts[i + 1]}` : '';
  return two && FEMALE.has(two) ? two : parts[i]!;
}

export function classifyHebrewName(name?: string | null): GenderClassificationResult {
  const n = extractFirstName(name);
  if (!n) return { gender: 'unknown', confidence: 'ambiguous' };
  const m = MALE.has(n), f = FEMALE.has(n);
  if (UNISEX.has(n) || (m && f)) return { gender: 'unknown', confidence: 'ambiguous', matchedName: n };
  if (m) return { gender: 'male', confidence: 'high', matchedName: n };
  if (f) return { gender: 'female', confidence: 'high', matchedName: n };
  if (/(ית|ילה|רה)$/.test(n)) return { gender: 'female', confidence: 'medium', matchedName: n };
  return { gender: 'unknown', confidence: 'ambiguous', matchedName: n };
}
