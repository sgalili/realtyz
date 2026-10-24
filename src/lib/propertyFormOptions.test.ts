import { describe, expect, it } from 'vitest';
import { EMPTY_PUBLIC_LISTING_DRAFT as empty } from './publicListingDraft';
import { updateFloorSelection, validFloorPair, toggleBalconyType } from './propertyFormOptions';

describe('property floor rules', () => {
  it('sets building floors to ground when ground floor is selected', () => {
    expect(updateFloorSelection({ ...empty, floor: '2', totalFloors: '5' }, 'floor', 'קרקע')).toMatchObject({ floor: 'קרקע', totalFloors: 'קרקע' });
  });
  it('rejects a floor above building floors', () => {
    expect(updateFloorSelection({ ...empty, floor: '2', totalFloors: '5' }, 'floor', '6').floor).toBe('2');
    expect(validFloorPair('6', '5')).toBe(false);
  });
  it('reduces the floor when building floors are reduced', () => {
    expect(updateFloorSelection({ ...empty, floor: '5', totalFloors: '5' }, 'totalFloors', '2')).toMatchObject({ floor: '2', totalFloors: '2' });
  });
  it('permits a ground-only building', () => expect(validFloorPair('קרקע', 'קרקע')).toBe(true));
  it('supports multiple balconies and exclusive no-balcony', () => {
    expect(toggleBalconyType(['מרפסת שמש'], 'מרפסת שירות')).toEqual(['מרפסת שמש', 'מרפסת שירות']);
    expect(toggleBalconyType(['מרפסת שמש'], 'ללא מרפסת')).toEqual([]);
  });
});