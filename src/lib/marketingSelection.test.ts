import { describe, expect, it } from 'vitest';
import { selectedMarketingCards } from './marketingSelection';

describe('instant marketing selection', () => {
  const cards = [{ id: 'available' }];
  it('has no marketing targets before any property is selected', () => {
    expect(selectedMarketingCards(cards, new Set(), true)).toEqual([]);
  });
  it('includes the actively selected property only', () => {
    expect(selectedMarketingCards(cards, new Set(['available', 'unavailable']), true)).toEqual(cards);
  });
  it('has no targets when multi-select is inactive', () => {
    expect(selectedMarketingCards(cards, new Set(['available']), false)).toEqual([]);
  });
});