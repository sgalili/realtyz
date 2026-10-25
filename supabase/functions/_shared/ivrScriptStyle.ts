export function shouldLearnIvrScript(successfulCalls: number, text: string) {
  return successfulCalls > 0 && text.trim().length > 0;
}

export function ivrScriptStyle(text: string) {
  const sentences = text.trim().split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return `סגנון תסריטי IVR שנשלחו: כ-${words} מילים, ${sentences.length} משפטים, כ-${Math.round(words / Math.max(1, sentences.length))} מילים למשפט. ${/שלום|היי/.test(sentences[0] ?? '') ? 'פתיחה בברכה קצרה.' : 'פתיחה ישירה.'} ${/ביקור|סיור/.test(sentences.at(-1) ?? '') ? 'סיום בהזמנה קצרה לתיאום ביקור.' : 'סיום קצר לקבלת פרטים.'}`;
}