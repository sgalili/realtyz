import { describe, expect, it } from 'vitest';
import { EMPTY_LEAD_FILTER, EMPTY_PROPERTY_FILTER, matchesPropertyFilter, matchesLeadFilter, selectFilterCity, setLeadFilterMinimum, leadFilterSliderRange } from './leadTypeFilter';

describe('reward filter bounds', () => {
  it('closing starts at 0 rather than the public 0.52 minimum', () => {
    expect(leadFilterSliderRange('tier4', { min: 0.52, max: 37600 })).toEqual({ min: 0, max: 37600 });
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

describe('nationwide city selection', () => {
  it('nationwide clears all previously selected cities', () => {
    expect(selectFilterCity({ ...EMPTY_PROPERTY_FILTER, city: 'חיפה', selectedCities: ['חיפה', 'תל אביב'] }, 'all').selectedCities).toEqual([]);
  });
  it('cannot add a city while nationwide is selected', () => {
    const next = selectFilterCity(EMPTY_PROPERTY_FILTER, 'חיפה');
    expect(next.city).toBe('all');
    expect(next.selectedCities ?? []).toEqual([]);
  });
  it('can select multiple cities after explicitly clearing nationwide', () => {
    const choose = selectFilterCity(EMPTY_PROPERTY_FILTER, 'choose');
    const next = selectFilterCity(selectFilterCity(choose, 'חיפה'), 'תל אביב');
    expect(next.selectedCities).toEqual(['חיפה', 'תל אביב']);
    expect(matchesPropertyFilter({ city: 'תל אביב' }, next)).toBe(true);
    expect(matchesPropertyFilter({ city: 'אילת' }, next)).toBe(false);
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