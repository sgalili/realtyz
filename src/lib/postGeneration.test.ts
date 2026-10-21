import { describe, expect, it } from 'vitest';
import { completedPostText, evidencedPropertyDetails, POST_GENERATION_OPTIONS } from '../../supabase/functions/_shared/postGeneration';

describe('post generation completion', () => {
  it('rejects the truncated reasoning response instead of saving it as a post', () => {
    expect(() => completedPostText({ choices: [{ finish_reason: 'length', message: { content: 'Wait, what does LISTING-FOCUS MODE say?' } }] })).toThrow();
  });
  it('rejects internal instructions even if marked complete', () => {
    expect(() => completedPostText({ choices: [{ finish_reason: 'stop', message: { content: 'בדיקה Ground every concrete detail' } }] })).toThrow();
  });
  it('accepts completed Hebrew property text', () => {
    expect(completedPostText({ choices: [{ finish_reason: 'stop', message: { content: '🏡 דירת ארבעה חדרים למכירה בהרצליה' } }] })).toBe('🏡 דירת ארבעה חדרים למכירה בהרצליה');
  });
  it('preserves the model and disables thinking that exhausted the existing budget', () => {
    expect(POST_GENERATION_OPTIONS.model).toBe('google/gemini-2.5-flash');
    expect(POST_GENERATION_OPTIONS.reasoning.enabled).toBe(false);
  });
  it('includes available property specifications without private notes or fabricated values', () => {
    expect(evidencedPropertyDetails({ source_metadata: { balcony_sqm: 12, mamad: true, private_notes: 'secret' } })).toBe('balcony_sqm: 12\nmamad: true');
    expect(evidencedPropertyDetails({})).toBe('');
  });
});