import { beforeEach, describe, expect, it } from 'vitest';
import { dismissWelcome, welcomeDismissed } from './welcomePreference';

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
});