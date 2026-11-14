import { describe, expect, it } from 'vitest';
import { remainingPageLoadingTime } from './pageLoadingDuration';
describe('full-page minimum duration', () => {
  it('holds a quickly completed page until exactly three seconds', () => {
    expect(remainingPageLoadingTime(1_000, 1_100)).toBe(2_900);
    expect(remainingPageLoadingTime(1_000, 3_999)).toBe(1);
    expect(remainingPageLoadingTime(1_000, 4_000)).toBe(0);
  });
  it('adds no delay when actual loading exceeds three seconds', () => {
    expect(remainingPageLoadingTime(1_000, 9_000)).toBe(0);
  });
});