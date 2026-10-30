// Shared "lead type + lead value" filter used by every partner screen.
//
// A property offers a lead type only when the publisher priced that tier:
//   tier1 digital lead · tier2 WhatsApp screening · tier3 phone call ·
//   tier4 deal closing (licensed brokers only).
export type LeadTypeKey = 'tier1' | 'tier2' | 'tier3' | 'tier4';

export const LEAD_TYPE_LABELS: Record<LeadTypeKey, string> = {
  tier1: 'שדות מטופס בעמוד נחיתה',
  tier2: 'סינון בווטסאפ',
  tier3: 'שיחת טלפון',
  tier4: 'סגירת עסקה',
};

export const LEAD_TYPE_ORDER: LeadTypeKey[] = ['tier1', 'tier2', 'tier3', 'tier4'];

export type LeadTierAmounts = Record<LeadTypeKey, number>;

export type LeadFilterState = {
  types: LeadTypeKey[];
  min: number | null;
  max: number | null;
  prices?: Partial<Record<LeadTypeKey, number>>;
};

export const EMPTY_LEAD_FILTER: LeadFilterState = { types: [], min: null, max: null };

/** Closing search starts at zero; other tiers retain their public minimum. */
export function leadFilterSliderRange(key: LeadTypeKey, bounds?: { min: number | null; max: number | null }) {
  if (bounds?.min == null || bounds.max == null) return key === 'tier4' ? { min: 0, max: 250 } : undefined;
  const min = key === 'tier4' ? 0 : Number(bounds.min);
  const max = Number(bounds.max);
  return Number.isFinite(min) && Number.isFinite(max) && max >= min ? { min, max } : undefined;
}

export function setLeadFilterMinimum(state: LeadFilterState, key: LeadTypeKey, amount: number): LeadFilterState {
  const value = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const previous = state.types[0];
  const prices = { ...(state.prices ?? (previous ? { [previous]: state.min ?? 0 } : {})), [key]: value };
  return { ...state, types: LEAD_TYPE_ORDER.filter(type => (prices[type] ?? 0) > 0), min: null, max: null, prices };
}

export function leadFilterActiveCount(state: LeadFilterState): number {
  return state.types.length + (state.min != null ? 1 : 0) + (state.max != null ? 1 : 0);
}

/** Tier amounts off any listing-shaped row (broker rows or marketplace rows). */
export function leadTierAmounts(row: Record<string, unknown> | null | undefined): LeadTierAmounts {
  const num = (...keys: string[]): number => {
    for (const key of keys) {
      const value = row?.[key];
      if (value != null && value !== '') return Number(value) || 0;
    }
    return 0;
  };
  return {
    tier1: num('affiliate_tier1_amount', 'tier1_amount'),
    tier2: num('affiliate_tier2_amount', 'tier2_amount'),
    tier3: num('affiliate_tier3_amount', 'tier3_amount'),
    tier4: num('affiliate_tier4_amount', 'tier4_amount'),
  };
}

/**
 * A row passes when it offers at least one of the selected lead types (all
 * priced types when none is selected) and the value of one of those leads
 * falls inside the requested range.
 */
export function matchesLeadFilter(amounts: LeadTierAmounts, state: LeadFilterState): boolean {
  if (state.prices) {
    const priced = LEAD_TYPE_ORDER.filter(key => (state.prices?.[key] ?? 0) > 0);
    return !priced.length || priced.some(key => amounts[key] >= (state.prices?.[key] ?? 0));
  }
  const keys = state.types.length ? state.types : LEAD_TYPE_ORDER;
  const values = keys.map((key) => amounts[key]).filter((value) => value > 0);
  if (state.types.length && values.length === 0) return false;
  if (state.min == null && state.max == null) return true;
  if (values.length === 0) return false;
  return values.some((value) =>
    (state.min == null || value >= state.min) && (state.max == null || value <= state.max));
}

// ---------------------------------------------------------------------------
// Property filters (deal type, kind, location, rooms, price, size, floor).
// ---------------------------------------------------------------------------
export type PropertyFilterState = {
  dealType: 'all' | 'sale' | 'rent';
  propertyType: string;
  city: string;
  neighborhood: string;
  selectedCities?: string[];
  roomsMin: number | null;
  roomsMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
  sizeMin: number | null;
  sizeMax: number | null;
  floorMin: number | null;
  floorMax: number | null;
  /** Feature keys from FILTER_FEATURES; every selected feature must be present. */
  features?: string[];
  amenities?: {
    rooms?: string; elevatorCount?: string; parkingCount?: string; balconyTypes?: string[];
    viewType?: string; airDirections?: string; condition?: string; entryDate?: string; totalFloors?: string;
  };
};

/** Property features offered in the post-ad flow and imported listings. */
export const FILTER_FEATURES: Array<{ key: string; label: string; keys: string[]; text: RegExp }> = [
  { key: 'elevator', label: 'מעלית', keys: ['elevator', 'elevator_count', 'includeElevator'], text: /מעלית/ },
  { key: 'parking', label: 'חניה', keys: ['parking', 'parking_count', 'parking_spots', 'includeParking'], text: /חני/ },
  { key: 'balcony', label: 'מרפסת', keys: ['balcony', 'balcony_types', 'includeBalcony'], text: /מרפס/ },
  { key: 'safe_room', label: 'ממ״ד', keys: ['safe_room', 'shelter', 'includeSecurityRoom'], text: /ממ["״]?ד/ },
  { key: 'shelter', label: 'מקלט', keys: ['includeFloorShelter', 'includeBuildingShelter'], text: /מקלט/ },
  { key: 'storage', label: 'מחסן', keys: ['storage', 'warehouse', 'includeWarehouse'], text: /מחסן/ },
  { key: 'ac', label: 'מיזוג אוויר', keys: ['ac', 'air_conditioning', 'includeAirconditioner', 'includeTornado'], text: /מיזוג|מזגן/ },
  { key: 'solar', label: 'דוד שמש', keys: ['solar', 'solar_heater', 'includeBoiler'], text: /דוד שמש/ },
  { key: 'furnished', label: 'מרוהט', keys: ['furnished', 'includeFurniture'], text: /מרוהט|ריהוט/ },
  { key: 'bars', label: 'סורגים', keys: ['bars', 'includeBars'], text: /סורג/ },
  { key: 'rav_bariach', label: 'דלת רב בריח', keys: ['includeRavBariach'], text: /רב.?בריח/ },
  { key: 'accessible', label: 'גישה לנכים', keys: ['accessible', 'isHandicapped'], text: /נכים|נגיש/ },
  { key: 'renovated', label: 'משופץ', keys: ['renovated', 'isRenovated'], text: /משופץ/ },
  { key: 'kosher', label: 'מטבח כשר', keys: ['kosher_kitchen', 'isKitchenKosher'], text: /כשר/ },
  { key: 'pets', label: 'מותר בעלי חיים', keys: ['pets', 'pets_allowed', 'isPetsAllowed'], text: /בעלי חיים|חיות/ },
  { key: 'garden', label: 'גינה / חצר', keys: ['garden', 'yard', 'garden_sqm'], text: /גינ|חצר/ },
  { key: 'open_view', label: 'נוף פתוח', keys: ['open_view'], text: /נוף/ },
  { key: 'pillar', label: 'בניין על עמודים', keys: ['isPillarBuilding'], text: /עמודים/ },
  { key: 'exclusive', label: 'בבלעדיות', keys: ['isAssetExclusive'], text: /בלעדי/ },
];

const truthyFeature = (value: unknown): boolean => {
  if (value == null || value === false) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') { const v = value.trim(); return !!v && v !== '0' && v !== 'false' && !/^(ללא|אין)/.test(v); }
  return value === true;
};

/** True when the row (or its nested features/raw bags) carries the feature. */
export function rowHasFeature(row: Record<string, unknown>, featureKey: string): boolean {
  const def = FILTER_FEATURES.find(f => f.key === featureKey);
  if (!def) return true;
  const bags: Record<string, unknown>[] = [row];
  const raw = row.raw as Record<string, unknown> | undefined;
  if (raw && typeof raw === 'object') bags.push(raw);
  for (const bag of [...bags]) {
    const f = bag.features;
    if (f && typeof f === 'object' && !Array.isArray(f)) {
      bags.push(f as Record<string, unknown>);
      const sd = (f as Record<string, unknown>).source_details;
      if (sd && typeof sd === 'object') bags.push(sd as Record<string, unknown>);
    }
  }
  for (const bag of bags) {
    if (def.keys.some(key => truthyFeature(bag[key]))) return true;
    for (const listKey of ['features', 'amenity_labels', 'amenities', 'feature_labels']) {
      const list = bag[listKey];
      if (Array.isArray(list) && list.some(item => typeof item === 'string' && def.text.test(item))) return true;
    }
  }
  return false;
}

export const EMPTY_PROPERTY_FILTER: PropertyFilterState = {
  dealType: 'all',
  propertyType: 'all',
  city: 'all',
  neighborhood: 'all',
  roomsMin: null,
  roomsMax: null,
  priceMin: null,
  priceMax: null,
  sizeMin: null,
  sizeMax: null,
  floorMin: null,
  floorMax: null,
};

export function propertyFilterActiveCount(state: PropertyFilterState): number {
  let count = 0;
  if (state.dealType !== 'all') count += 1;
  if (state.propertyType !== 'all') count += 1;
  if (state.city && state.city !== 'all') count += state.selectedCities?.length || 1;
  if (state.neighborhood !== 'all') count += 1;
  for (const key of ['roomsMin', 'roomsMax', 'priceMin', 'priceMax', 'sizeMin', 'sizeMax', 'floorMin', 'floorMax'] as const) {
    if (state[key] != null) count += 1;
  }
  return count + (state.features?.length ?? 0) + Object.values(state.amenities ?? {}).filter(value => Array.isArray(value) ? value.length > 0 : !!value).length;
}

function numeric(row: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (value != null && value !== '') {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function text(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function matchesPropertyFilter(row: Record<string, unknown>, state: PropertyFilterState): boolean {
  const inRange = (value: number | null, min: number | null, max: number | null) => {
    if (min == null && max == null) return true;
    if (value == null) return false;
    return (min == null || value >= min) && (max == null || value <= max);
  };
  if (state.dealType !== 'all' && text(row, 'deal_type', 'listing_type') !== state.dealType) return false;
  if (state.propertyType !== 'all' && text(row, 'property_type') !== state.propertyType) return false;
  if (state.city && state.city !== 'all') {
    const cities = state.selectedCities?.length ? state.selectedCities : [state.city];
    if (!cities.includes(text(row, 'city'))) return false;
  }
  if (state.neighborhood !== 'all' && text(row, 'neighborhood') !== state.neighborhood) return false;
  if (!inRange(numeric(row, 'rooms'), state.roomsMin, state.roomsMax)) return false;
  if (!inRange(numeric(row, 'asking_price', 'price'), state.priceMin, state.priceMax)) return false;
  if (!inRange(numeric(row, 'sqm', 'size_sqm'), state.sizeMin, state.sizeMax)) return false;
  if (!inRange(numeric(row, 'floor'), state.floorMin, state.floorMax)) return false;
  if (state.features?.length && !state.features.every(key => rowHasFeature(row, key))) return false;
  const selected = state.amenities;
  if (selected) {
    const raw = row.raw && typeof row.raw === 'object' ? row.raw as Record<string, unknown> : {};
    const features = row.features && typeof row.features === 'object' && !Array.isArray(row.features) ? row.features as Record<string, unknown> : {};
    const rawFeatures = raw.features && typeof raw.features === 'object' && !Array.isArray(raw.features) ? raw.features as Record<string, unknown> : {};
    const source = features.source_details && typeof features.source_details === 'object' ? features.source_details as Record<string, unknown> : {};
    const bags = [row, features, raw, rawFeatures, source];
    const read = (...keys: string[]): unknown => {
      for (const bag of bags) for (const key of keys) if (bag[key] != null && bag[key] !== '') return bag[key];
      return undefined;
    };
    const countMatches = (choice: string | undefined, actual: unknown) => {
      if (!choice) return true;
      const n = actual === true ? 1 : actual === false ? 0 : actual === 'קרקע' ? 0 : Number.parseFloat(String(actual));
      const expected = Number.parseFloat(choice);
      return Number.isFinite(n) && (choice.endsWith('+') ? n >= expected : n === expected);
    };
    if (!countMatches(selected.rooms, read('rooms'))) return false;
    if (!countMatches(selected.elevatorCount, read('elevator_count', 'elevatorCount', 'elevator', 'includeElevator'))) return false;
    if (!countMatches(selected.parkingCount, read('parking_count', 'parkingCount', 'parking', 'parking_spots', 'includeParking'))) return false;
    if (!countMatches(selected.totalFloors === 'קרקע' ? '0' : selected.totalFloors, read('total_floors', 'totalFloors'))) return false;
    if (!countMatches(selected.airDirections, read('air_directions', 'airDirections'))) return false;
    if (selected.condition && read('condition') !== selected.condition) return false;
    if (selected.viewType && read('view_type', 'viewType') !== selected.viewType && !(selected.viewType === 'נוף פתוח' && read('open_view', 'openView') === true)) return false;
    if (selected.entryDate && read('entry_date', 'entryDate') !== selected.entryDate) return false;
    if (selected.balconyTypes?.length) {
      const actual = read('balcony_types', 'balconyTypes');
      if (selected.balconyTypes.includes('ללא מרפסת')) {
        if (!(Array.isArray(actual) && actual.length === 0) && read('balcony', 'includeBalcony') !== false) return false;
      } else if (!Array.isArray(actual) || !selected.balconyTypes.some(type => actual.includes(type))) return false;
    }
  }
  return true;
}

/** Nationwide replaces city selections and blocks additions until explicitly cleared. */
export function selectFilterCity(state: PropertyFilterState, value: string): PropertyFilterState {
  if (value === 'all') return { ...state, city: 'all', selectedCities: [], neighborhood: 'all' };
  if (value === 'choose') return { ...state, city: '', selectedCities: [], neighborhood: 'all' };
  if (state.city === 'all') return state;
  const current = state.selectedCities ?? (state.city ? [state.city] : []);
  const selectedCities = current.includes(value) ? current.filter(city => city !== value) : [...current, value];
  return { ...state, city: selectedCities[0] ?? '', selectedCities, neighborhood: 'all' };
}
