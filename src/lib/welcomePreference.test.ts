import { beforeEach, describe, expect, it } from 'vitest';
import { dismissWelcome, welcomeDismissed, shouldShowWelcome } from './welcomePreference';

describe('welcome opt-out', () => {
  beforeEach(() => localStorage.clear());
  it('continues showing after the old seen-once preference', () => {
    localStorage.setItem('toraf-welcome-slides-seen-v1', '1');
    expect(welcomeDismissed()).toBe(false);
  });
  it('stops automatic display only after explicit opt-out', () => {
    expect(welcomeDismissed()).toBe(false);
    dismissWelcome();
    expect(welcomeDismissed()).toBe(true);
  });
  it('does not reopen from the logo or header after opting out', () => {
    dismissWelcome();
    expect(shouldShowWelcome('logo')).toBe(false);
  });
  it('does not reopen on homepage returns after opting out', () => {
    dismissWelcome();
    expect(shouldShowWelcome('home')).toBe(false);
  });
  it('permits explicit instructions replay without resetting opt-out', () => {
    dismissWelcome();
    expect(shouldShowWelcome('instructions')).toBe(true);
    expect(welcomeDismissed()).toBe(true);
    expect(shouldShowWelcome('home')).toBe(false);
  });
});