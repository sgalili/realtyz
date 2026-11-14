import { describe, expect, it } from 'vitest';
import { tableOverflowState } from './tableOverflow';

describe('table overflow fade edges', () => {
  it('shows only the forward fade at the LTR start and only the return fade at the end', () => {
    expect(tableOverflowState({ scrollLeft: 0, scrollWidth: 1000, clientWidth: 400, rtl: false })).toEqual({ max: 600, start: false, end: true });
    expect(tableOverflowState({ scrollLeft: 600, scrollWidth: 1000, clientWidth: 400, rtl: false })).toEqual({ max: 600, start: true, end: false });
  });
  it('supports negative RTL offsets and both fades midway', () => {
    expect(tableOverflowState({ scrollLeft: 0, scrollWidth: 1000, clientWidth: 400, rtl: true })).toEqual({ max: 600, start: false, end: true });
    expect(tableOverflowState({ scrollLeft: -300, scrollWidth: 1000, clientWidth: 400, rtl: true })).toEqual({ max: 600, start: true, end: true });
    expect(tableOverflowState({ scrollLeft: -600, scrollWidth: 1000, clientWidth: 400, rtl: true })).toEqual({ max: 600, start: true, end: false });
  });
  it('removes all fades when every column fits', () => {
    expect(tableOverflowState({ scrollLeft: 0, scrollWidth: 400, clientWidth: 400, rtl: true })).toEqual({ max: 0, start: false, end: false });
  });
});
