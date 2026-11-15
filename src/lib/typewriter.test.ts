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
    expect(typewriterDelay({ ...two, phase: 'holding' })).toBe(1800);
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
});
