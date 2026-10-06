// ============= Yad2-style property attribute cards =============
// Translates every known attribute key to Hebrew, hides technical /
// backend metadata, and pairs each attribute with a clear icon so the
// public details page renders a clean icon-based grid (RTL).
import type { LucideIcon } from 'lucide-react';
import {
  Accessibility, Armchair, Award, BadgeCheck, Bath, Bed, Building, CalendarDays, Car, CarFront,
  Compass, DoorOpen, Dog, Fence, Flame, GraduationCap, Hash, Layers, MapPin, Maximize2, Receipt,
  Ruler, School, ShieldCheck, Snowflake, Store, Trees, Utensils, Waves, Wallet, Wrench,
} from 'lucide-react';

export type AttrCard = { icon: LucideIcon; label: string; value: string };

export const normalizeKey = (key: string) => key.trim().toLowerCase().replace(/[\s-]+/g, '_');

/** Technical / backend / private metadata — never shown on the public card. */
export const HIDDEN_ATTR_KEYS = new Set([
  'id', 'texteng', 'description', 'long_description', 'short_description', 'property_title', 'slug',
  'publisher_type', 'publisher_name', 'contact_whatsapp', 'contact_name', 'contact_email', 'contact_phone',
  'owner_phone', 'owner_name', 'owner_email', 'lead_daily_limits', 'commission_terms_accepted_at',
  'media_videos', 'media_photos', 'image_url', 'url', 'source', 'sources', 'source_url', 'external_id',
  'removed_photo_keys', 'media_vision_checked', 'media_vision_at', 'metadata_backfilled_at',
  'fetched_at', 'created_at', 'updated_at', 'office_notes', 'internal_notes', 'notes',
  'listing_type', 'deal_type', 'asking_price', 'price', 'price_history', 'city', 'workspace_owner_id',
  'user_id', 'status', 'is_featured', 'is_promoted', 'latitude', 'longitude',
  // already shown as the big header chips (rooms / sqm / floor):
  'rooms', 'roomscount', 'sqm', 'squaremeter', 'floor',
]);

/** key (normalized) → [Hebrew label, icon] */
const TRANSLATIONS: Record<string, [string, LucideIcon]> = {
  // identity
  property_type: ['סוג נכס', Home],
  text: ['סוג נכס', Home],
  street: ['רחוב', MapPin],
  street_number: ['מספר בית', Hash],
  house_number: ['מספר בית', Hash],
  neighborhood: ['שכונה', MapPin],
  area: ['שטח', Maximize2],
  project_name: ['פרויקט', Building],
  // sizes & rooms
  squaremeterbuild: ['שטח בנוי', Ruler],
  built_sqm: ['שטח בנוי', Ruler],
  squaremetergarden: ['שטח גינה', Trees],
  garden_sqm: ['שטח גינה', Trees],
  lot_sqm: ['שטח מגרש', Maximize2],
  balcony_sqm: ['שטח מרפסת', DoorOpen],
  bedrooms: ['חדרי שינה', Bed],
  bathrooms: ['חדרי רחצה', Bath],
  toilets: ['שירותים', Bath],
  // floor / building
  total_floors: ['קומות בבניין', Building],
  buildingtopfloor: ['קומות בבניין', Building],
  totalfloors: ['קומות בבניין', Building],
  floors_in_building: ['קומות בבניין', Building],
  year_built: ['שנת בנייה', CalendarDays],
  // entry
  entry_date: ['תאריך כניסה', CalendarDays],
  entrancedate: ['תאריך כניסה', CalendarDays],
  available_from: ['תאריך כניסה', CalendarDays],
  isimmediateentrance: ['כניסה מיידית', CalendarDays],
  isenterdateflexible: ['כניסה גמישה', CalendarDays],
  paymentscount: ['תשלומים', Wallet],
  payments: ['תשלומים', Wallet],
  // condition & air
  condition: ['מצב הנכס', BadgeCheck],
  propertycondition: ['מצב הנכס', BadgeCheck],
  air_directions: ['כיווני אוויר', Compass],
  airdirections: ['כיווני אוויר', Compass],
  exposure: ['כיווני אוויר', Compass],
  open_view: ['נוף פתוח', Sparkles],
  view: ['נוף', Sparkles],
  // money
  arnona: ['ארנונה', Receipt],
  property_tax: ['ארנונה', Receipt],
  vaad_bayit: ['ועד בית', Wallet],
  house_committee: ['ועד בית', Wallet],
  // amenities
  elevator: ['מעלית', Building],
  parking: ['חניה', Car],
  includeparking: ['חניה כלולה', Car],
  parkingspacescount: ['מקומות חניה', CarFront],
  balcony: ['מרפסת', DoorOpen],
  balconiescount: ['מרפסות', DoorOpen],
  includesecurityroom: ['ממ״ד', ShieldCheck],
  mamad: ['ממ״ד', ShieldCheck],
  safe_room: ['ממ״ד', ShieldCheck],
  includefloorshelter: ['מקלט קומתי', ShieldCheck],
  includebuildingshelter: ['מקלט בבניין', ShieldCheck],
  shelter: ['מקלט', ShieldCheck],
  shelterdistance: ['מרחק למקלט', ShieldCheck],
  includewarehouse: ['מחסן', Package],
  warehouse: ['מחסן', Package],
  storage: ['מחסן', Package],
  includeairconditioner: ['מיזוג אוויר', Snowflake],
  air_conditioning: ['מיזוג אוויר', Snowflake],
  includetornado: ['מזגן טורנדו', Snowflake],
  includeboiler: ['דוד שמש', Flame],
  solar_heater: ['דוד שמש', Flame],
  boiler: ['דוד חשמל', Flame],
  heating: ['חימום', Flame],
  includefurniture: ['מרוהט', Armchair],
  furnished: ['מרוהט', Armchair],
  furniture_details: ['ריהוט', Armchair],
  includebars: ['סורגים', Fence],
  includeravbariach: ['דלת רב בריח', ShieldCheck],
  iskitchenkosher: ['מטבח כשר', Utensils],
  kosher_kitchen: ['מטבח כשר', Utensils],
  ispetsallowed: ['מותר בעלי חיים', Dog],
  pets_allowed: ['מותר בעלי חיים', Dog],
  pets: ['חיות מחמד', Dog],
  ishandicapped: ['גישה לנכים', Accessibility],
  accessible: ['גישה לנכים', Accessibility],
  isrenovated: ['משופץ', Wrench],
  renovated: ['משופץ', Wrench],
  ispillarbuilding: ['בניין על עמודים', Building],
  isassetexclusive: ['בבלעדיות', Award],
  pool: ['בריכה', Waves],
  garden: ['גינה', Trees],
  yard: ['חצר', Trees],
  roommates: ['שותפים', Bed],
  long_term: ['לטווח ארוך', CalendarDays],
};

// imported below to keep the icon list tidy
import { Home, Package, Sparkles } from 'lucide-react';

/** English value → Hebrew */
const VALUE_LABELS: Record<string, string> = {
  sale: 'מכירה', rent: 'השכרה', apartment: 'דירה', house: 'בית פרטי', cottage: 'קוטג׳',
  penthouse: 'פנטהאוז', duplex: 'דופלקס', studio: 'סטודיו', commercial: 'מסחרי', land: 'מגרש',
  new: 'חדש', renovated: 'משופץ', good: 'שמור', needs_renovation: 'דורש שיפוץ',
  'true': 'כן', 'false': 'לא', broker: 'מתווך', owner: 'בעלים',
};

const SUFFIX_UNITS: Record<string, (n: number) => string> = {
  area: (n) => `${n.toLocaleString('he-IL')} מ״ר`,
  squaremetergarden: (n) => `${n} מ״ר`,
  garden_sqm: (n) => `${n} מ״ר`,
  squaremeterbuild: (n) => `${n} מ״ר`,
  built_sqm: (n) => `${n} מ״ר`,
  lot_sqm: (n) => `${n} מ״ר`,
  balcony_sqm: (n) => `${n} מ״ר`,
  shelterdistance: (n) => `${n} מ׳`,
  arnona: (n) => `₪${n.toLocaleString('he-IL')}`,
  property_tax: (n) => `₪${n.toLocaleString('he-IL')}`,
  vaad_bayit: (n) => `₪${n.toLocaleString('he-IL')}`,
  house_committee: (n) => `₪${n.toLocaleString('he-IL')}`,
};

const AIR_DIRECTIONS = ['צפון', 'דרום', 'מזרח', 'מערב'];

function airDirectionsText(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  if (n >= 1 && n <= 4) return AIR_DIRECTIONS[n - 1];
  const parts = AIR_DIRECTIONS.filter((_, bit) => (n >> bit) & 1);
  return parts.join(' / ');
}

function attrReadable(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '' || value === false) return '';
  if (typeof value === 'boolean') return 'כן';
  if (typeof value === 'object') {
    if (Array.isArray(value)) return value.map((v) => attrReadable(key, v)).filter(Boolean).join(', ');
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => { const t = attrReadable(k, v); return t ? `${TRANSLATIONS[normalizeKey(k)]?.[0] ?? k}: ${t}` : ''; })
      .filter(Boolean).join(' · ');
  }
  const n = Number(value);
  if (key === 'area') { // non-numeric "area" is a city/region name — already in the address
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? `${n} מ״ר` : '';
  }
  const unit = SUFFIX_UNITS[key];
  if (unit && Number.isFinite(n) && n > 0) return unit(n);
  if (key === 'air_directions' || key === 'airdirections' || key === 'exposure') {
    const air = airDirectionsText(value) || (typeof value === 'string' && /[\u0590-\u05FF]/.test(value) ? value : '');
    return air;
  }
  const date = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (date) return `${date[3]}.${date[2]}.${date[1]}`;
  const raw = String(value).trim();
  if (key === 'total_floors' || key === 'buildingtopfloor' || key === 'totalfloors' || key === 'floors_in_building') {
    return Number.isFinite(n) ? String(n) : raw;
  }
  return VALUE_LABELS[raw.toLowerCase()] ?? raw;
}

/** All displayable attributes of a raw listing row → ordered icon cards. */
export function attributeCards(row: Record<string, any>): AttrCard[] {
  const cards = new Map<string, AttrCard>();
  const sources = [row?.features, row?.attributes, row?.additional_details, row?.furniture_details];
  for (const source of sources) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
    for (const [rawKey, value] of Object.entries(source as Record<string, unknown>)) {
      const key = normalizeKey(rawKey);
      if (HIDDEN_ATTR_KEYS.has(key)) continue;
      const entry = TRANSLATIONS[key];
      if (!entry) continue; // unknown/technical keys stay hidden — only mapped attributes show
      const value2 = attrReadable(key, value);
      if (!value2) continue;
      if (!cards.has(key)) cards.set(key, { icon: entry[1], label: entry[0], value: value2 });
    }
  }
  const seen = new Set<string>();
  return [...cards.values()].filter((c) => (seen.has(c.label) ? false : (seen.add(c.label), true)));
}
