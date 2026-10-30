import { describe, expect, it } from 'vitest';
import { EMPTY_LEAD_FILTER, EMPTY_PROPERTY_FILTER, matchesPropertyFilter, selectFilterCity, selectLeadFilterType, setLeadFilterMinimum, leadFilterSliderRange } from './leadTypeFilter';

describe('reward filter bounds', () => {
  it('closing starts at 0 rather than the public 0.52 minimum', () => {
    expect(leadFilterSliderRange('tier4', { min: 0.52, max: 37600 })).toEqual({ min: 0, max: 37600 });
  });
  it('other lead types retain their actual public minimum', () => {
    expect(leadFilterSliderRange('tier1', { min: 60, max: 150 })).toEqual({ min: 60, max: 150 });
  });
});

describe('single reward selection', () => {
  it('selects exactly one lead type', () => {
    expect(selectLeadFilterType({ ...EMPTY_LEAD_FILTER, types: ['tier1', 'tier2'] }, 'tier3').types).toEqual(['tier3']);
  });
  it('restores a positive price when returning to its lead type', () => {
    const form = setLeadFilterMinimum(EMPTY_LEAD_FILTER, 'tier1', 75);
    const phone = setLeadFilterMinimum(selectLeadFilterType(form, 'tier3'), 'tier3', 120);
    expect(selectLeadFilterType(phone, 'tier1').min).toBe(75);
    expect(phone.prices?.tier1).toBe(75);
  });
  it('zero clears only the selected threshold', () => {
    const form = setLeadFilterMinimum(EMPTY_LEAD_FILTER, 'tier1', 75);
    const zero = setLeadFilterMinimum(form, 'tier1', 0);
    expect(zero.min).toBeNull();
    expect(zero.prices?.tier1).toBe(0);
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