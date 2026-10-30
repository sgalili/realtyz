import type { PublicListingDraftFields } from './publicListingDraft';

export const PROPERTY_TYPE_OPTIONS = ['דירה', 'דירת גן', 'פנטהאוז', 'דופלקס', 'בית פרטי', 'מיני פנטהאוז', 'סטודיו', 'מגרש', 'משרד', 'חנות', 'מחסן'];
export const PROPERTY_CONDITION_OPTIONS = ['חדש מקבלן', 'חדש', 'משופץ', 'שמור', 'דרוש שיפוץ'];
export const PROPERTY_FLOOR_OPTIONS = ['קרקע', ...Array.from({ length: 9 }, (_, index) => String(index + 1)), '10+'];
export const PROPERTY_ROOM_OPTIONS = ['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6+'];
export const PROPERTY_BALCONY_OPTIONS = ['מרפסת שמש', 'מרפסת שירות', 'מרפסת מקורה', 'מרפסת סוכה', 'מרפסת גג'];
export const PROPERTY_VIEW_OPTIONS = ['ללא נוף', 'נוף פתוח', 'נוף לים', 'נוף לעיר', 'נוף לפארק', 'נוף להרים', 'נוף ירוק'];
export const PROPERTY_AIR_OPTIONS = ['1', '2', '3', '4'];

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