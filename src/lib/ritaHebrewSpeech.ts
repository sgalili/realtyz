import { normalizeRitaGender } from './ritaVoice';

export type RitaPronunciationLocator = { pronunciation_dictionary_id: string; version_id: string };
export function ritaPronunciationLocators(value: unknown, gender: unknown): RitaPronunciationLocator[] {
  const config = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const selected = config[normalizeRitaGender(gender)];
  const candidates = [...(Array.isArray(config['base']) ? config['base'] : []), ...(selected ? [selected] : [])];
  return candidates.filter((item): item is RitaPronunciationLocator => !!item && typeof item === 'object' && typeof item['pronunciation_dictionary_id'] === 'string' && typeof item['version_id'] === 'string').slice(0, 3);
}

export function ritaGenderPhonemeRules(gender: 'male' | 'female') {
  const canonical = gender === 'female'
    ? [['לך', 'לָךְ', 'laχ'], ['איתך', 'אִתָּךְ', 'iˈtaχ'], ['עבורך', 'עֲבוּרֵךְ', 'avuˈʁeχ'], ['שלך', 'שֶׁלָּךְ', 'ʃeˈlaχ'], ['תרצי', 'תִּרְצִי', 'tiʁˈtsi']]
    : [['לך', 'לְךָ', 'leˈχa'], ['איתך', 'אִתְּךָ', 'iˈtχa'], ['עבורך', 'עֲבוּרְךָ', 'avuʁˈχa'], ['שלך', 'שֶׁלְּךָ', 'ʃelˈχa'], ['תרצה', 'תִּרְצֶה', 'tiʁˈtse']];
  return [...canonical.flatMap(([bare, vocalized, phoneme]) => [bare, vocalized].map(string_to_replace => ({ type: 'phoneme', string_to_replace, phoneme, alphabet: 'ipa', word_boundaries: true }))),
    ...['טוֹרָאף', 'TORAFF', 'TORAF'].map(string_to_replace => ({ type: 'phoneme', string_to_replace, phoneme: 'toˈʁaf', alphabet: 'ipa', word_boundaries: true }))];
}

/** Vocalize only standalone ambiguous words; leave names and facts untouched. */
export function vocalizeRitaHebrew(value: string, gender: unknown): string {
  const female = normalizeRitaGender(gender) === 'female';
  const forms: Record<string, string> = female
    ? { לך: 'לָךְ', איתך: 'אִתָּךְ', עבורך: 'עֲבוּרֵךְ', שלך: 'שֶׁלָּךְ', תרצה: 'תִּרְצִי', תרצי: 'תִּרְצִי' }
    : { לך: 'לְךָ', איתך: 'אִתְּךָ', עבורך: 'עֲבוּרְךָ', שלך: 'שֶׁלְּךָ', תרצה: 'תִּרְצֶה', תרצי: 'תִּרְצֶה' };
  return value.replace(/(?<![\u0590-\u05ff\w])(לך|איתך|עבורך|שלך|תרצה|תרצי)(?![\u0590-\u05ff\w])/gu, word => forms[word] ?? word)
    .replace(/\bTORAFF?\b/gi, 'טוֹרָאף');
}

/** Conservative STT cleanup: no invented words, genders or corrected facts. */
export function normalizeRitaTranscriptText(value: string): string {
  return value.normalize('NFC').replace(/\[(?:inaudible|silence|noise)\]|<\|[^>]*\|>/gi, '')
    .replace(/\bTORAFF?\b/gi, 'טוֹרָאף')
    .replace(/[\u200b-\u200f\u202a-\u202e]/g, '')
    .replace(/[–—]|-{2,}/g, ',').replace(/\s+([,.!?])/g, '$1')
    .replace(/([,.!?])\1+/g, '$1').replace(/\s+/g, ' ').trim();
}

export function formatRitaTranscript(transcript: unknown, callerName: string): string {
  if (!Array.isArray(transcript)) return '';
  return transcript.map(turn => {
    if (!turn || typeof turn !== 'object') return '';
    const item = turn as Record<string, unknown>;
    const raw = item['message'] ?? item['text'];
    if (typeof raw !== 'string') return '';
    const text = normalizeRitaTranscriptText(raw).slice(0, 4000);
    if (!text) return '';
    const role = item['role'] ?? item['speaker'];
    const speaker = role === 'agent' || role === 'assistant' ? 'ריטה' : role === 'user' || role === 'caller' ? normalizeRitaTranscriptText(callerName) || 'המתקשר' : 'מערכת';
    return `${speaker}: ${text}${/[.!?:]$/.test(text) ? '' : '.'}`;
  }).filter(Boolean).join('\n').slice(0, 100000);
}