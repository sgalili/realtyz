/** Explicit profile preference only; never infer personal gender from a name. */
export type PersonalGender = 'male' | 'female' | null;
export const profileGender = (value: unknown): PersonalGender => value === 'male' || value === 'female' ? value : null;
export type GenderText = { male: string; female: string; neutral: string };
export function genderText(gender: PersonalGender, forms: GenderText): string {
  return forms[gender ?? 'neutral'];
}
/** Only authored UI commands are translated, never arbitrary user content. */
const COMMANDS: Record<string, GenderText> = {
  'בחר': { male: 'בחר', female: 'בחרי', neutral: 'בחירה' },
  'הזן': { male: 'הזן', female: 'הזיני', neutral: 'הזנה' },
  'הקלד': { male: 'הקלד', female: 'הקלידי', neutral: 'הקלדה' },
  'שמור': { male: 'שמור', female: 'שמרי', neutral: 'שמירה' },
  'שלח': { male: 'שלח', female: 'שלחי', neutral: 'שליחה' },
  'פתח': { male: 'פתח', female: 'פתחי', neutral: 'פתיחה של' },
  'הוסף': { male: 'הוסף', female: 'הוסיפי', neutral: 'הוספה של' },
  'מחק': { male: 'מחק', female: 'מחקי', neutral: 'מחיקה של' },
  'ערוך': { male: 'ערוך', female: 'ערכי', neutral: 'עריכה של' },
  'לחץ': { male: 'לחץ', female: 'לחצי', neutral: 'לחיצה' },
  'המשך': { male: 'המשך', female: 'המשיכי', neutral: 'המשך' },
  'אשר': { male: 'אשר', female: 'אשרי', neutral: 'אישור' },
  'נסה שוב': { male: 'נסה שוב', female: 'נסי שוב', neutral: 'אפשר לנסות שוב' },
};
export function localizeCommand(text: string | undefined, gender: PersonalGender): string | undefined {
  if (!text) return text;
  for (const [command, forms] of Object.entries(COMMANDS)) {
    if (text === command || text.startsWith(`${command} `)) return genderText(gender, forms) + text.slice(command.length);
  }
  return text;
}
export function personalizeMessage(text: string, gender: PersonalGender): string {
  // Explicit tokens in system-owned copy only; fixed approved template text is untouched.
  return text.replace(/\{\{gender:([^|{}]+)\|([^|{}]+)\|([^{}]+)\}\}/g,
    (_match, male, female, neutral) => genderText(gender, { male, female, neutral }));
}
type ProfileReader = { from: (table: 'profiles') => { select: (fields: string) => { eq: (field: string, value: string) => { maybeSingle: () => PromiseLike<{ data: { gender?: unknown } | null; error?: unknown }> } } } };
export async function recipientProfileGender(reader: ProfileReader, userId: string): Promise<PersonalGender> {
  const { data, error } = await reader.from('profiles').select('gender').eq('id', userId).maybeSingle();
  return error ? null : profileGender(data?.gender);
}