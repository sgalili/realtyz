import type { PublicListingDraftFields } from './publicListingDraft';

export const floorNumber = (value: string) => value === 'קרקע' ? 0 : Number.parseInt(value, 10);
export function validFloorPair(floor: string, totalFloors: string) {
  return Boolean(floor && totalFloors && floorNumber(floor) <= floorNumber(totalFloors));
}
export function updateFloorSelection(current: PublicListingDraftFields, key: 'floor' | 'totalFloors', value: string): PublicListingDraftFields {
  if (key === 'floor' && value === 'קרקע') return { ...current, floor: value, totalFloors: value };
  if (key === 'floor' && current.totalFloors && floorNumber(value) > floorNumber(current.totalFloors)) return current;
  return { ...current, [key]: value, ...(key === 'totalFloors' && current.floor && floorNumber(current.floor) > floorNumber(value) ? { floor: value } : {}) };
}
export function toggleBalconyType(current: string[], option: string) {
  if (option === 'ללא מרפסת') return [];
  return current.includes(option) ? current.filter(value => value !== option) : [...current, option];
}