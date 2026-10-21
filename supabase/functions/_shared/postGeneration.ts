/** Keep the existing model and visible-output budgets; do not spend them on thinking. */
export const POST_GENERATION_OPTIONS = {
  model: 'google/gemini-2.5-flash',
  reasoning: { enabled: false, effort: 'none', exclude: true },
};

export function completedPostText(data: { choices?: { finish_reason?: string; message?: { content?: string; refusal?: string } }[] }): string {
  const choice = data.choices?.[0];
  if (choice?.message?.refusal) throw new Error('יצירת התוכן נדחתה על ידי ספק ה-AI.');
  if (choice?.finish_reason === 'length') throw new Error('יצירת התוכן נעצרה לפני שהושלמה. הטקסט החלקי לא נשמר.');
  const text = choice?.message?.content?.trim() || '';
  if (!text || !/[א-ת]/u.test(text) || /LISTING.FOCUS MODE|Ground every concrete detail|Wait, what|system prompt|PROMOTED LISTING/i.test(text)) {
    throw new Error('לא התקבל תוכן תקין בעברית. הטקסט החלקי לא נשמר.');
  }
  return text;
}

export function evidencedPropertyDetails(listing: Record<string, unknown>): string {
  const meta = listing.source_metadata && typeof listing.source_metadata === 'object'
    ? listing.source_metadata as Record<string, unknown> : {};
  const keys = ['total_floors', 'floors_in_building', 'balcony_sqm', 'balconies', 'bathrooms', 'parking', 'parking_spaces', 'storage', 'air_conditioning', 'mamad', 'safe_room', 'accessible', 'renovated', 'furnished', 'view', 'directions', 'entry_date'];
  return keys.flatMap(key => {
    const value = listing[key] ?? meta[key];
    return value === undefined || value === null || value === '' ? [] : [`${key}: ${String(value)}`];
  }).join('\n');
}