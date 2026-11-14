import { describe, expect, it } from 'vitest';
import { guessGenderFromHebrewName, resolveLeadGender } from './hebrewGender';

describe('explicit Hebrew gender resolution', () => {
  it('never infers gender from a name', () => {
    expect(guessGenderFromHebrewName('נועם ירושלמי')).toBeNull();
    expect(guessGenderFromHebrewName('אורנה קרמונה')).toBeNull();
  });
  it('an explicit stored gender always wins', () => {
    expect(resolveLeadGender({ gender: 'female', full_name: 'אורן קרמונה' })).toBe('female');
  });
});
