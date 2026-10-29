import { describe, expect, it } from 'vitest';
import { EMPTY_PROPERTY_FILTER, matchesPropertyFilter, selectFilterCity } from './leadTypeFilter';

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