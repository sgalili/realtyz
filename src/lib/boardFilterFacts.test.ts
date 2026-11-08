import { expect, it } from 'vitest';
import { boardFilterFacts } from '../../supabase/functions/_shared/boardFilterFacts';
import { matchesPropertyFilter, EMPTY_PROPERTY_FILTER } from './leadTypeFilter';

it('projects imported property facts so dropdown selections match exact saved values', () => {
  const facts = boardFilterFacts({ additional_details: { text: 'דירה', includeElevator: true, parkingSpacesCount: 2, propertyCondition: 'משופץ', buildingTopFloor: 5, isImmediateEntrance: true, contact_phone: 'private' }, features: { deal_closing_commission: { value: 2, type: 'percent' }, contact_name: 'private' } });
  const filter = { ...EMPTY_PROPERTY_FILTER, propertyType: 'דירה', amenities: { parkingCount: '2', elevatorCount: '1', condition: 'משופץ', entryDate: 'מיידית' } };
  expect(matchesPropertyFilter(facts, filter)).toBe(true);
  expect(matchesPropertyFilter(facts, { ...filter, amenities: { parkingCount: '1' } })).toBe(false);
  expect(facts.features).not.toHaveProperty('deal_closing_commission');
  expect(facts.features).not.toHaveProperty('contact_name');
  expect(facts).not.toHaveProperty('additional_details');
});

it('preserves explicit zero amenities without guessing missing ones', () => {
  const zero = boardFilterFacts({ features: { parking_count: '0' } });
  expect(matchesPropertyFilter(zero, { ...EMPTY_PROPERTY_FILTER, amenities: { parkingCount: '0' } })).toBe(true);
  expect(matchesPropertyFilter(boardFilterFacts({}), { ...EMPTY_PROPERTY_FILTER, amenities: { parkingCount: '0' } })).toBe(false);
});