import { describe, expect, it } from 'vitest';
import { guessGenderFromHebrewName, resolveLeadGender } from './hebrewGender';

describe('hebrew gender resolution for demo publishers', () => {
  it('treats נועם and אורנה as female so related text matches their photos', () => {
    expect(guessGenderFromHebrewName('נועם ירושלמי')).toBe('female');
    expect(guessGenderFromHebrewName('אורנה קרמונה')).toBe('female');
  });
  it('an explicit stored gender always wins', () => {
    expect(resolveLeadGender({ gender: 'female', full_name: 'אורן קרמונה' })).toBe('female');
  });
});
