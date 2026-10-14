import { describe, it, expect } from 'vitest';
import { brainTextDocumentName } from './brainTextDocument';

describe('brain text file names', () => {
  it('uses the first instruction line with a text extension', () => {
    expect(brainTextDocumentName('  הנחיות ריטה\nתוכן נוסף')).toBe('הנחיות ריטה.txt');
  });
  it('sanitizes unsafe names and bounds length', () => {
    expect(brainTextDocumentName('A/B: C?')).toBe('A B C.txt');
    expect(brainTextDocumentName('א'.repeat(100)).length).toBe(74);
    expect(brainTextDocumentName('   ')).toBe('הנחיות.txt');
  });
});