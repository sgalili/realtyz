import { describe, expect, it } from 'vitest';
import { formatRitaTranscript, vocalizeRitaHebrew, ritaGenderPhonemeRules, ritaPronunciationLocators } from './ritaHebrewSpeech';
import { ritaOpeningGreeting, buildRitaDynamicVariables, ritaProviderVariables } from './ritaVoice';

describe('gender-aware Hebrew speech processing', () => {
  it('selects only the correct gender dictionary while retaining shared rules', () => {
    const male = { pronunciation_dictionary_id: 'male', version_id: 'v1' };
    const female = { pronunciation_dictionary_id: 'female', version_id: 'v2' };
    const base = { pronunciation_dictionary_id: 'shared', version_id: 'v3' };
    expect(ritaPronunciationLocators({ male, female, base: [base] }, 'female')).toEqual([base, female]);
    expect(ritaPronunciationLocators({ male, female, base: [base] }, undefined)).toEqual([base, male]);
  });
  it('uses explicit male and female phonemes for the same ambiguous word', () => {
    expect(ritaGenderPhonemeRules('male').find(rule => rule.string_to_replace === 'לך')?.phoneme).toBe('leˈχa');
    expect(ritaGenderPhonemeRules('female').find(rule => rule.string_to_replace === 'לך')?.phoneme).toBe('laχ');
  });
  it('vocalizes each ambiguous pronoun for a male caller', () => {
    expect(vocalizeRitaHebrew('לך איתך עבורך שלך תרצה', 'male')).toBe('לְךָ אִתְּךָ עֲבוּרְךָ שֶׁלְּךָ תִּרְצֶה');
  });
  it('vocalizes each ambiguous pronoun for an explicitly female caller', () => {
    expect(vocalizeRitaHebrew('לך איתך עבורך שלך תרצה', 'female')).toBe('לָךְ אִתָּךְ עֲבוּרֵךְ שֶׁלָּךְ תִּרְצִי');
  });
  it('defaults provider context to male and preserves an explicit female', () => {
    expect(ritaProviderVariables({ gender: null })['gender']).toBe('male');
    expect(ritaProviderVariables({ gender: 'female' })['gender']).toBe('female');
  });
  it('vocalizes server-owned welcome greetings without changing names', () => {
    const greeting = ritaOpeningGreeting(buildRitaDynamicVariables({ source: 'welcome', callRole: 'broker_support', brokerStage: 'onboarded_welcome', fullName: 'דני כהן', gender: 'male' }));
    expect(greeting).toContain('שֶׁלְּךָ'); expect(greeting).toContain('עֲבוּרְךָ'); expect(greeting).toContain('דני');
  });
  it('cleans STT noise, assigns speakers, and retains factual numbers', () => {
    expect(formatRitaTranscript([{ role: 'agent', message: 'TORAFF [silence]  שלום  !!' }, { role: 'user', message: 'התקציב 2500000' }, { role: 'agent', tool_calls: [] }], 'דני כהן')).toBe('ריטה: טוֹרָאף שלום!\nדני כהן: התקציב 2500000.');
  });
});