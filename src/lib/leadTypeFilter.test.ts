import { describe, expect, it } from 'vitest';
import { EMPTY_LEAD_FILTER, EMPTY_PROPERTY_FILTER, boardLeadPriceBounds, leadTierAmounts, matchesPropertyFilter, matchesLeadFilter, selectFilterCity, setLeadFilterMinimum, leadFilterSliderRange } from './leadTypeFilter';

describe('reward filter bounds', () => {
  it('closing preserves the actual board minimum and maximum', () => {
    expect(leadFilterSliderRange('tier4', { min: 416, max: 37600 })).toEqual({ min: 416, max: 37600 });
  });
  it('does not invent closing bounds when authorized data is absent', () => {
    expect(leadFilterSliderRange('tier4')).toBeUndefined();
    expect(boardLeadPriceBounds([{ price: 3000000 }]).closing).toEqual({ min: null, max: null });
  });
  it('uses whole net shekels for percentage/fixed closing bounds across the full board', () => {
    const rows = [{ price: 3000000, affiliate_tier4_amount: 1, affiliate_tier4_type: 'percent' }, { price: 6000, affiliate_tier4_amount: 3000, affiliate_tier4_type: 'fixed' }, { affiliate_tier4_amount: 0 }];
    expect(boardLeadPriceBounds(rows).closing).toEqual({ min: 2400, max: 24000 });
    expect(leadTierAmounts(rows[0]).tier4).toBe(24000);
    expect(matchesLeadFilter(leadTierAmounts(rows[0]), setLeadFilterMinimum(EMPTY_LEAD_FILTER, 'tier4', 24000))).toBe(true);
    expect(matchesLeadFilter(leadTierAmounts(rows[1]), setLeadFilterMinimum(EMPTY_LEAD_FILTER, 'tier4', 24000))).toBe(false);
  });
  it('matches loaded board rewards without affiliate marketplace membership', () => {
    expect(leadTierAmounts({ affiliate_tier1_amount: 100 }).tier1).toBe(80);
    expect(matchesLeadFilter(leadTierAmounts({ affiliate_tier1_amount: 100 }), setLeadFilterMinimum(EMPTY_LEAD_FILTER, 'tier1', 80))).toBe(true);
    expect(matchesLeadFilter(leadTierAmounts({ affiliate_tier1_amount: 99 }), setLeadFilterMinimum(EMPTY_LEAD_FILTER, 'tier1', 80))).toBe(false);
  });
  it('other lead types retain their actual public minimum', () => {
    expect(leadFilterSliderRange('tier1', { min: 60, max: 150 })).toEqual({ min: 60, max: 150 });
  });
});

describe('per-type reward thresholds', () => {
  it('keeps each positive threshold active automatically', () => {
    const form = setLeadFilterMinimum(EMPTY_LEAD_FILTER, 'tier1', 75);
    const phone = setLeadFilterMinimum(form, 'tier3', 120);
    expect(phone.types).toEqual(['tier1', 'tier3']);
    expect(phone.prices?.tier1).toBe(75);
    expect(phone.prices?.tier3).toBe(120);
    expect(matchesLeadFilter({ tier1: 74, tier2: 200, tier3: 119, tier4: 0 }, phone)).toBe(false);
    expect(matchesLeadFilter({ tier1: 75, tier2: 0, tier3: 0, tier4: 0 }, phone)).toBe(true);
    expect(matchesLeadFilter({ tier1: 0, tier2: 0, tier3: 120, tier4: 0 }, phone)).toBe(true);
  });
  it('zero clears only the selected threshold', () => {
    const form = setLeadFilterMinimum(EMPTY_LEAD_FILTER, 'tier1', 75);
    const zero = setLeadFilterMinimum(form, 'tier1', 0);
    expect(zero.min).toBeNull();
    expect(zero.prices?.tier1).toBe(0);
    expect(zero.types).toEqual([]);
    expect(matchesLeadFilter({ tier1: 0, tier2: 0, tier3: 0, tier4: 0 }, zero)).toBe(true);
  });
});

describe('city selection', () => {
  it('nationwide clears all previously selected cities', () => {
    expect(selectFilterCity({ ...EMPTY_PROPERTY_FILTER, city: 'חיפה', selectedCities: ['חיפה', 'תל אביב'] }, 'all').selectedCities).toEqual([]);
  });
  it('picking a city while nationwide is active selects only that city', () => {
    const next = selectFilterCity(EMPTY_PROPERTY_FILTER, 'חיפה');
    expect(next.city).toBe('חיפה');
    expect(next.selectedCities).toEqual(['חיפה']);
  });
  it('keeps every chosen city and filters to exactly those cities', () => {
    const next = selectFilterCity(selectFilterCity(EMPTY_PROPERTY_FILTER, 'חיפה'), 'תל אביב');
    expect(next.selectedCities).toEqual(['חיפה', 'תל אביב']);
    expect(matchesPropertyFilter({ city: 'תל אביב' }, next)).toBe(true);
    expect(matchesPropertyFilter({ city: 'אילת' }, next)).toBe(false);
  });
  it('deselecting the last city returns to nationwide', () => {
    const next = selectFilterCity(selectFilterCity(EMPTY_PROPERTY_FILTER, 'חיפה'), 'חיפה');
    expect(next.selectedCities).toEqual([]);
    expect(next.city).toBe('all');
    expect(matchesPropertyFilter({ city: 'אילת' }, next)).toBe(true);
  });
});

describe('publisher-style property options', () => {
  it('matches room counts including the 6+ choice', () => {
    const state = { ...EMPTY_PROPERTY_FILTER, amenities: { rooms: '6+' } };
    expect(matchesPropertyFilter({ rooms: 7 }, state)).toBe(true);
    expect(matchesPropertyFilter({ rooms: 5.5 }, state)).toBe(false);
  });
  it('matches exact elevator and parking counts without treating missing as none', () => {
    const state = { ...EMPTY_PROPERTY_FILTER, amenities: { elevatorCount: '3+', parkingCount: '0' } };
    expect(matchesPropertyFilter({ features: { elevator_count: '4', parking_count: '0' } }, state)).toBe(true);
    expect(matchesPropertyFilter({ features: { elevator_count: '2', parking_count: '0' } }, state)).toBe(false);
    expect(matchesPropertyFilter({ features: { elevator_count: '4' } }, state)).toBe(false);
  });
  it('matches selected balcony types, view and air directions from saved features', () => {
    const state = { ...EMPTY_PROPERTY_FILTER, amenities: { balconyTypes: ['מרפסת שמש'], viewType: 'נוף לים', airDirections: '2' } };
    expect(matchesPropertyFilter({ features: { balcony_types: ['מרפסת שמש'], view_type: 'נוף לים', air_directions: '2' } }, state)).toBe(true);
    expect(matchesPropertyFilter({ features: { balcony_types: ['מרפסת שירות'], view_type: 'נוף לים', air_directions: '2' } }, state)).toBe(false);
  });
  it('matches condition and immediate entry without guessing absent values', () => {
    const state = { ...EMPTY_PROPERTY_FILTER, amenities: { condition: 'שמור', entryDate: 'מיידית' } };
    expect(matchesPropertyFilter({ features: { condition: 'שמור', entry_date: 'מיידית' } }, state)).toBe(true);
    expect(matchesPropertyFilter({ features: { condition: 'שמור' } }, state)).toBe(false);
  });
});