import { describe, expect, it } from 'vitest';
import { cropPixelRegion } from './imageCrop';

describe('image crop coordinates', () => {
  it('maps a square selection on a landscape source to original pixels', () => {
    expect(cropPixelRegion({ x: 25, y: 0, width: 50, height: 100 }, 1200, 600))
      .toEqual({ x: 300, y: 0, width: 600, height: 600 });
  });
  it('maps a landscape selection on a portrait source to original pixels', () => {
    const crop = cropPixelRegion({ x: 0, y: 25, width: 100, height: 21.875 }, 700, 1400);
    expect(crop).toEqual({ x: 0, y: 350, width: 700, height: 306.25 });
    expect(crop.width / crop.height).toBeCloseTo(16 / 7);
  });
});