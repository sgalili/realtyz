import { describe, expect, it } from 'vitest';
import { thresholdOffer } from './offerThreshold';

describe('publisher offer thresholds', () => {
  it.each([['form', 40, 150], ['whatsapp', 50, 200], ['phone', 80, 250], ['closing sale', 0.2, 2], ['closing rent ILS', 1000, 10000]] as const)('%s allows only zero or its configured range', (_, min, max) => {
    expect(thresholdOffer(0, min, max, min)).toBe(0);
    expect(thresholdOffer(min / 10, min, max, 0)).toBe(min);
    expect(thresholdOffer(min / 2, min, max, min)).toBe(0);
    expect(thresholdOffer(min / 2, min, max)).toBe(min);
    expect(thresholdOffer(max - min / 2, min, max, min)).toBe(max - min / 2);
    expect(thresholdOffer(max + 1, min, max, min)).toBe(max);
  });
});