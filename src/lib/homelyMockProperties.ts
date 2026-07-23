// Mock Homely property catalogue — used by /properties page until the real
// Homely API is wired (only call site is the homely-search edge function which
// already prefers a live key when one is configured).
//
// Shape mirrors `PropertyResult` from supabase/functions/homely-search/index.ts
// so the page can swap the source transparently when a real API is connected.

export type PropertySource = "homely" | "listings" | "mock" | "yad2" | "mine";

export type ListingType = "sale" | "rent";

export type PropertyAgent = {
  name: string;
  phone: string;
  email: string;
  agency?: string;
  photo?: string;
};

export type HomelyProperty = {
  id: string;
  source: PropertySource;
  title: string;
  description: string;
  price: number;
  currency: string;
  city: string;
  rooms: number;
  size_sqm: number;
  property_type: PropertyType;
  photos: string[];
  images?: string[];
  url: string | null;
  source_url?: string | null;
  source_metadata?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  features: string[];
  listing_type?: ListingType;
  floor?: number;
  total_floors?: number;
  address?: string;
  year_built?: number;
  agent?: PropertyAgent;
};

export const LISTING_TYPE_LABELS_HE: Record<ListingType, string> = {
  sale: "למכירה",
  rent: "להשכרה",
};

const DEFAULT_AGENT: PropertyAgent = {
  name: 'דניאל לוי',
  phone: '052-555-1234',
  email: 'daniel@realtyz.ai',
  agency: 'Realtyz AI',
};

export type PropertyType = "apartment" | "penthouse" | "house" | "duplex" | "garden_apt";

export const PROPERTY_TYPE_LABELS_HE: Record<PropertyType | "all", string> = {
  all: "כל הסוגים",
  apartment: "דירה",
  penthouse: "פנטהאוז",
  house: "בית פרטי",
  duplex: "דופלקס",
  garden_apt: "דירת גן",
};

export const CITY_OPTIONS = [
  "כל הערים",
  "תל אביב",
  "ירושלים",
  "חיפה",
  "רמת גן",
  "הרצליה",
  "רמת השרון",
  "באר שבע",
  "פתח תקווה",
  "כפר סבא",
] as const;

const PHOTO = (seed: string) =>
  `https://images.unsplash.com/photo-${seed}?auto=format&fit=crop&w=1200&q=80`;

const RAW_MOCK_HOMELY_PROPERTIES: HomelyProperty[] = [
  {
    id: "homely-p-1001",
    source: "homely",
    title: 'דירת 4 חד\' מעוצבת בלב הצפון הישן',
    description: 'דירה מוארת ומשופצת ברמה גבוהה, מטבח חדש, סלון מרווח ושני מרפסות שמש.',
    price: 3450000, currency: "₪", city: "תל אביב", rooms: 4, size_sqm: 105, property_type: "apartment",
    photos: [PHOTO("1502672260266-1c1ef2d93688"), PHOTO("1505691938895-1758d7feb511")],
    url: null, features: ["מעלית", "ממ\"ד", "מרפסת שמש", "חניה"],
  },
  {
    id: "homely-p-1002",
    source: "homely",
    title: "פנטהאוז 5 חדרים עם נוף לים",
    description: "פנטהאוז יוקרתי בקומה גבוהה, מרפסת גג ענקית, ג'קוזי ונוף פתוח.",
    price: 6850000, currency: "₪", city: "הרצליה", rooms: 5, size_sqm: 165, property_type: "penthouse",
    photos: [PHOTO("1512917774080-9991f1c4c750"), PHOTO("1493809842364-78817add7ffb")],
    url: null, features: ["מרפסת גג", "ג'קוזי", "נוף לים", "חניה כפולה"],
  },
  {
    id: "homely-p-1003",
    source: "homely",
    title: 'דירת 3 חד\' משופצת ברמת גן',
    description: 'דירה משפחתית באזור שקט וירוק, קרובה לקניון איילון ולפארק הלאומי.',
    price: 2150000, currency: "₪", city: "רמת גן", rooms: 3, size_sqm: 78, property_type: "apartment",
    photos: [PHOTO("1494526585095-c41746248156")],
    url: null, features: ["מעלית", "מרפסת", "מחסן"],
  },
  {
    id: "homely-p-1004",
    source: "homely",
    title: "בית פרטי 6 חדרים בשכונת פאר",
    description: "בית מרווח עם גינה גדולה, בריכה פרטית, מתאים למשפחה גדולה.",
    price: 5400000, currency: "₪", city: "כפר סבא", rooms: 6, size_sqm: 220, property_type: "house",
    photos: [PHOTO("1568605114967-8130f3a36994"), PHOTO("1564013799919-ab600027ffc6")],
    url: null, features: ["גינה", "בריכה", "מרתף", "חניה ל-3"],
  },
  {
    id: "homely-p-1005",
    source: "homely",
    title: "דופלקס 5 חדרים עם גג",
    description: "דופלקס חדש בבניין בוטיק, גג פרטי וסלון דו-מפלסי.",
    price: 4250000, currency: "₪", city: "תל אביב", rooms: 5, size_sqm: 145, property_type: "duplex",
    photos: [PHOTO("1600585154340-be6161a56a0c"), PHOTO("1600596542815-ffad4c1539a9")],
    url: null, features: ["גג פרטי", "מעלית", "ממ\"ד", "חניה"],
  },
  {
    id: "homely-p-1006",
    source: "homely",
    title: 'דירת גן 4 חד\' עם חצר',
    description: "דירת גן מקסימה עם כניסה פרטית וחצר מטופחת — מושלם למשפחה.",
    price: 2780000, currency: "₪", city: "פתח תקווה", rooms: 4, size_sqm: 110, property_type: "garden_apt",
    photos: [PHOTO("1493809842364-78817add7ffb")],
    url: null, features: ["חצר פרטית", "כניסה פרטית", "חניה", "מחסן"],
  },
  {
    id: "homely-p-1007",
    source: "homely",
    title: 'דירת 4 חד\' מול הפארק',
    description: "דירה מוארת מול פארק העיר, קומה 4 עם מעלית וחניה תת-קרקעית.",
    price: 1990000, currency: "₪", city: "באר שבע", rooms: 4, size_sqm: 95, property_type: "apartment",
    photos: [PHOTO("1502672023488-70e25813eb80")],
    url: null, features: ["מעלית", "חניה", "ממ\"ד"],
  },
  {
    id: "homely-p-1008",
    source: "homely",
    title: "פנטהאוז יוקרה במגדלי הירקון",
    description: "פנטהאוז על שני מפלסים, נוף 360 מעלות, מועדון דיירים ובריכה.",
    price: 9800000, currency: "₪", city: "תל אביב", rooms: 6, size_sqm: 210, property_type: "penthouse",
    photos: [PHOTO("1600585154526-990dced4db0d")],
    url: null, features: ["בריכה משותפת", "כושר", "קונסיירז'", "נוף לים"],
  },
  {
    id: "homely-p-1009",
    source: "homely",
    title: 'דירת 3 חד\' חדשה בירושלים',
    description: "דירה חדשה ביוקרה במרכז העיר, קרוב לקו הרכבת הקלה.",
    price: 2380000, currency: "₪", city: "ירושלים", rooms: 3, size_sqm: 82, property_type: "apartment",
    photos: [PHOTO("1505691938895-1758d7feb511")],
    url: null, features: ["מעלית", "ממ\"ד", "מרפסת"],
  },
  {
    id: "homely-p-1010",
    source: "homely",
    title: 'דירת 5 חד\' פנורמית בחיפה',
    description: "דירה ענקית עם נוף פנורמי למפרץ, מטבח אי וסלון מרווח במיוחד.",
    price: 2650000, currency: "₪", city: "חיפה", rooms: 5, size_sqm: 140, property_type: "apartment",
    photos: [PHOTO("1502672023488-70e25813eb80")],
    url: null, features: ["נוף לים", "מטבח אי", "מעלית", "חניה"],
  },
];


// Enrich raw mock with listing_type, floor, address, agent details so the
// catalogue and the property detail page have rich data without a backend.
export const MOCK_HOMELY_PROPERTIES: HomelyProperty[] = RAW_MOCK_HOMELY_PROPERTIES.map((p, i) => {
  const isRent = i % 3 === 2; // ~1 in 3 listings is for rent
  return {
    ...p,
    listing_type: (p.listing_type ?? (isRent ? "rent" : "sale")) as ListingType,
    price: isRent && p.price > 200_000 ? Math.round(p.price / 600 / 100) * 100 : p.price,
    floor: p.floor ?? ((i % 8) + 1),
    total_floors: p.total_floors ?? Math.max(((i % 8) + 1), ((i % 8) + 3)),
    address: p.address ?? `רחוב הרצל ${10 + i}, ${p.city}`,
    year_built: p.year_built ?? 2005 + (i % 18),
    agent: p.agent ?? {
      ...DEFAULT_AGENT,
      name: ["דניאל לוי", "מיכל כהן", "אורן ברק", "נועה שפירא"][i % 4],
      phone: ["052-555-1234", "054-777-8821", "050-219-4477", "053-441-9090"][i % 4],
      email: ["daniel@realtyz.ai","michal@realtyz.ai","oren@realtyz.ai","noa@realtyz.ai"][i % 4],
    },
  };
});
