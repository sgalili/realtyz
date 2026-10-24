import { describe, expect, it } from 'vitest';
import { tableWheelPosition } from './tableWheel';

const rtl = { left: 0, top: 0, maxX: 600, maxY: 400, rtl: true };
describe('table wheel scrolling', () => {
  it('moves only along the dominant axis, never diagonally', () => {
    expect(tableWheelPosition(rtl, -200, 100, false)).toEqual({ left: -200, top: 0 });
    expect(tableWheelPosition(rtl, -50, 120, false)).toEqual({ left: 0, top: 120 });
  });
  it('supports horizontal mouse scrolling with Shift in RTL', () => {
    expect(tableWheelPosition(rtl, 0, 150, true)).toEqual({ left: -150, top: 0 });
  });
  it('clamps at both ends and permits reverse scrolling', () => {
    expect(tableWheelPosition({ ...rtl, left: -500, top: 350 }, -200, 0, false)).toEqual({ left: -600, top: 350 });
    expect(tableWheelPosition({ ...rtl, left: -500, top: 350 }, 0, 100, false)).toEqual({ left: -500, top: 400 });
    expect(tableWheelPosition({ ...rtl, left: -500, top: 350 }, 200, -100, false)).toEqual({ left: -300, top: 350 });
  });
});
