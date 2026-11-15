import { describe, expect, it } from 'vitest';
import { ritaChatKeyAction } from './ritaChatKeys';

const key = (over: Partial<{ key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; isComposing: boolean }> = {}) =>
  ({ key: 'Enter', metaKey: false, ctrlKey: false, shiftKey: false, isComposing: false, ...over });

describe('ritaChatKeyAction', () => {
  it('sends on a plain Enter', () => { expect(ritaChatKeyAction(key())).toBe('send'); });
  it('adds a new line on Command + Enter', () => { expect(ritaChatKeyAction(key({ metaKey: true }))).toBe('newline'); });
  it('adds a new line on Control + Enter', () => { expect(ritaChatKeyAction(key({ ctrlKey: true }))).toBe('newline'); });
  it('adds a new line on Shift + Enter', () => { expect(ritaChatKeyAction(key({ shiftKey: true }))).toBe('newline'); });
  it('leaves an in-progress IME Enter untouched', () => { expect(ritaChatKeyAction(key({ isComposing: true }))).toBe('ignore'); });
  it('ignores every other key', () => { expect(ritaChatKeyAction(key({ key: 'a' }))).toBe('ignore'); });
});
