import { describe, expect, it } from 'vitest';
import { ritaChatKeyAction } from './ritaChatKeys';

const key = (over: Partial<{ key: string; metaKey: boolean; ctrlKey: boolean; isComposing: boolean }> = {}) =>
  ({ key: 'Enter', metaKey: false, ctrlKey: false, isComposing: false, ...over });

describe('ritaChatKeyAction', () => {
  it('sends only on Command + Enter', () => {
    expect(ritaChatKeyAction(key({ metaKey: true }))).toBe('send');
  });

  it('sends only on Control + Enter', () => {
    expect(ritaChatKeyAction(key({ ctrlKey: true }))).toBe('send');
  });

  it('keeps a plain Enter as a new line', () => {
    expect(ritaChatKeyAction(key())).toBe('newline');
    expect(ritaChatKeyAction(key({ metaKey: true, ctrlKey: true }))).toBe('send');
  });

  it('leaves an in-progress IME Enter untouched', () => {
    expect(ritaChatKeyAction(key({ isComposing: true }))).toBe('ignore');
    expect(ritaChatKeyAction(key({ isComposing: true, metaKey: true }))).toBe('ignore');
  });

  it('ignores every other key', () => {
    expect(ritaChatKeyAction(key({ key: 'a' }))).toBe('ignore');
    expect(ritaChatKeyAction(key({ key: 'Escape' }))).toBe('ignore');
  });
});
