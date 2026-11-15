import { describe, expect, it } from 'vitest';
import { advanceTypewriter, INITIAL_TYPEWRITER_STATE, typewriterDelay } from './typewriter';

const messages = ['אב', 'ג'];

describe('typewriter sequence', () => {
  it('types one character at a time and then holds the complete message', () => {
    const one = advanceTypewriter(INITIAL_TYPEWRITER_STATE, messages);
    expect(one).toEqual({ messageIndex: 0, characterCount: 1, phase: 'typing' });
    const two = advanceTypewriter(one, messages);
    expect(two.characterCount).toBe(2);
    expect(advanceTypewriter(two, messages).phase).toBe('holding');
    expect(typewriterDelay({ ...two, phase: 'holding' }, messages)).toBe(1800);
  });

  it('deletes one character at a time before advancing', () => {
    const holding = { messageIndex: 0, characterCount: 2, phase: 'holding' as const };
    const deleting = advanceTypewriter(holding, messages);
    expect(deleting.phase).toBe('deleting');
    expect(advanceTypewriter(deleting, messages).characterCount).toBe(1);
    expect(advanceTypewriter({ ...deleting, characterCount: 1 }, messages).characterCount).toBe(0);
  });

  it('loops through messages without dropping the last one', () => {
    const empty = { messageIndex: 0, characterCount: 0, phase: 'deleting' as const };
    expect(advanceTypewriter(empty, messages)).toEqual({ messageIndex: 1, characterCount: 0, phase: 'typing' });
    expect(advanceTypewriter({ ...empty, messageIndex: 1 }, messages).messageIndex).toBe(0);
  });

  it('handles an empty message list safely', () => {
    expect(advanceTypewriter(INITIAL_TYPEWRITER_STATE, [])).toEqual(INITIAL_TYPEWRITER_STATE);
  });

  it('types 15% slower than the original 44ms per character', () => {
    const typing = { messageIndex: 0, characterCount: 1, phase: 'typing' as const };
    expect(typewriterDelay(typing, messages)).toBe(52);
    expect(typewriterDelay(INITIAL_TYPEWRITER_STATE, messages)).toBe(52);
  });

  it('keeps the deletion pace untouched', () => {
    expect(typewriterDelay({ messageIndex: 0, characterCount: 2, phase: 'deleting' as const }, messages)).toBe(24);
    expect(typewriterDelay({ messageIndex: 0, characterCount: 1, phase: 'deleting' as const }, messages)).toBe(24);
    expect(typewriterDelay({ messageIndex: 0, characterCount: 0, phase: 'deleting' as const }, messages)).toBe(350);
  });

  it('rests a full second after a comma, period or exclamation mark', () => {
    const punctuated = ['א,ב', 'ג.ד', 'ה!ו'];
    expect(
      typewriterDelay({ messageIndex: 0, characterCount: 2, phase: 'typing' as const }, punctuated),
    ).toBe(1000);
    expect(
      typewriterDelay({ messageIndex: 1, characterCount: 2, phase: 'typing' as const }, punctuated),
    ).toBe(1000);
    expect(
      typewriterDelay({ messageIndex: 2, characterCount: 2, phase: 'typing' as const }, punctuated),
    ).toBe(1000);
    // A normal character in the same sentence keeps the relaxed typing rhythm.
    expect(
      typewriterDelay({ messageIndex: 0, characterCount: 3, phase: 'typing' as const }, punctuated),
    ).toBe(52);
  });

  it('does not double-pause when punctuation ends the message', () => {
    const ended = ['א.'];
    expect(typewriterDelay({ messageIndex: 0, characterCount: 2, phase: 'typing' as const }, ended)).toBe(52);
  });
});
