import { describe, expect, it } from 'vitest';
import { thresholdOffer, offerScale } from './offerThreshold';

describe('publisher offer thresholds', () => {
  it.each([[40, 150, 1], [50, 200, 1], [80, 250, 1], [0.2, 2, 0.01], [10, 100, 1]])('maps zero then minimum and uniform increments without a dead zone (%s)', (min, max, step) => {
    const scale = offerScale(min, max, step);
    expect(scale.amount(0)).toBe(0);
    expect(scale.amount(1)).toBe(min);
    expect(scale.amount(2)).toBe(Number((min + step).toFixed(6)));
    expect(scale.amount(scale.max)).toBe(max);
    expect(scale.position(min)).toBe(1);
    expect(scale.position(max)).toBe(scale.max);
  });
  it.each([['form', 40, 150], ['whatsapp', 50, 200], ['phone', 80, 250], ['closing sale', 0.2, 2], ['closing rent ILS', 1000, 10000]] as const)('%s allows only zero or its configured range', (_, min, max) => {
    expect(thresholdOffer(0, min, max, min)).toBe(0);
    expect(thresholdOffer(min / 10, min, max, 0)).toBe(min);
    expect(thresholdOffer(min / 2, min, max, min)).toBe(0);
    expect(thresholdOffer(min / 2, min, max)).toBe(min);
    expect(thresholdOffer(max - min / 2, min, max, min)).toBe(max - min / 2);
    expect(thresholdOffer(max + 1, min, max, min)).toBe(max);
  });
});