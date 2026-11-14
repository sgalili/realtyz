import { describe, expect, it } from 'vitest';
import { remainingPageLoadingTime } from './pageLoadingDuration';
describe('full-page minimum duration', () => {
  it('holds a quickly completed page until exactly two seconds', () => {
    expect(remainingPageLoadingTime(1_000, 1_100)).toBe(1_900);
    expect(remainingPageLoadingTime(1_000, 2_999)).toBe(1);
    expect(remainingPageLoadingTime(1_000, 3_000)).toBe(0);
  });
  it('adds no delay when actual loading exceeds two seconds', () => {
    expect(remainingPageLoadingTime(1_000, 9_000)).toBe(0);
  });
});