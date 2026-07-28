import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Sofa, TrendingUp, MapPin, Navigation,
  ArrowUpCircle, Wind, Grid2X2, ShieldCheck, Sun, Armchair, DoorClosed,
  Accessibility, Fan, PaintRoller, Package, Warehouse, PawPrint, Users, Car, Home,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

export type PricePoint = { date: string | null; price: number | null; label?: string };

type Props = {
  aboutText?: string | null;
  /** Descriptions from multiple sources, rendered stacked as `Source:` + text. */
  aboutBlocks?: { source: string; text: string }[] | null;
  furniture?: Record<string, unknown> | null;
  additional?: Record<string, unknown> | null;
  amenities?: Record<string, unknown> | null;
  priceHistory?: PricePoint[] | null;
  latitude?: number | null;
  longitude?: number | null;
  addressLabel?: string | null;
};

/** Keys that are internal identifiers / noise — never rendered. */
const HIDDEN_KEYS = new Set([
  'id', 'uuid', 'key', 'texteng', 'slug', 'token', 'orderid', 'adnumber',
  'categoryid', 'subcategoryid', 'source', 'source_url', 'sourceurl',
]);

/**
 * Canonical Hebrew labels, keyed by a normalized form of the raw source key
 * (lowercase, `is`/`include`/`has` prefixes stripped, non-alphanumerics gone).
 * This is what turns `isRenovated` / `includeBars` into Yad2's own wording.
 */
const LABELS: Record<string, string> = {
  text: 'סוג נכס',
  propertytype: 'סוג נכס',
  assettype: 'סוג נכס',
  subcategory: 'סוג נכס',
  rooms: 'חדרים',
  roomscount: 'חדרים',
  roomsnumber: 'חדרים',
  bedrooms: 'חדרי שינה',
  bathrooms: 'חדרי רחצה',
  toilets: 'שירותים',
  מר: 'מ״ר בנוי סה״כ',
  squaremeter: 'מ״ר בנוי סה״כ',
  squaremeterbuild: 'מ״ר בנוי',
  squaremeterbuilt: 'מ״ר בנוי',
  builtsquaremeter: 'מ״ר בנוי',
  buildarea: 'מ״ר בנוי',
  totalsquaremeter: 'מ״ר סה״כ',
  squaremetergarden: 'מ״ר גינה',
  gardenarea: 'מ״ר גינה',
  balconiescount: 'מרפסות',
  balconies: 'מרפסות',
  buildingtopfloor: 'קומות בבניין',
  buildingfloors: 'קומות בבניין',
  totalfloors: 'קומות בבניין',
  floors: 'קומות בבניין',
  floor: 'קומה',
  onfloor: 'קומה',
  parkingquantity: 'מספר חניות',
  parkingspaces: 'מספר חניות',
  parkingspacescount: 'מספר חניות',
  parkingcount: 'מספר חניות',
  parking: 'חניה',
  vaadbayit: 'ועד בית לחודש',
  vaad: 'ועד בית לחודש',
  committee: 'ועד בית לחודש',
  arnona: 'ארנונה',
  municipaltax: 'ארנונה',
  price: 'מחיר',
  pricepermeter: 'מחיר למ״ר',
  monthlyrent: 'שכר דירה חודשי',
  deposit: 'פיקדון',
  payments: 'מספר תשלומים',
  paymentscount: 'מספר תשלומים',
  numofpayments: 'מספר תשלומים',
  entrancedate: 'תאריך כניסה',
  entrydate: 'תאריך כניסה',
  enterdate: 'תאריך כניסה',
  enterdateflexible: 'כניסה גמישה',
  flexibleentrydate: 'כניסה גמישה',
  immediate: 'כניסה מיידית',
  availablefrom: 'תאריך כניסה',
  yearbuilt: 'שנת בנייה',
  buildingyear: 'שנת בנייה',
  propertycondition: 'מצב הנכס',
  condition: 'מצב הנכס',
  renovated: 'משופץ',
  new: 'חדש',
  direction: 'כיווני אוויר',
  airdirections: 'כיווני אוויר',
  neighborhood: 'שכונה',
  street: 'רחוב',
  city: 'עיר',
  area: 'אזור',
  // Amenity-style flags
  bars: 'סורגים',
  boiler: 'דוד שמש',
  solarheater: 'דוד שמש',
  elevator: 'מעלית',
  maalit: 'מעלית',
  airconditioner: 'מיזוג',
  airconditioning: 'מיזוג',
  ac: 'מיזוג',
  tornado: 'מזגן טורנדו',
  tadiran: 'מיזוג',
  mamad: 'ממ״ד',
  shelter: 'ממ״ד',
  saferoom: 'ממ״ד',
  securityroom: 'ממ״ד',
  cludesecurityroom: 'ממ״ד',
  securitydoor: 'דלתות רב בריח',
  handicapped: 'גישה לנכים',
  accessible: 'גישה לנכים',
  accessibility: 'גישה לנכים',
  warehouse: 'מחסן',
  storage: 'מחסן',
  balcony: 'מרפסת',
  terrace: 'מרפסת',
  furniture: 'ריהוט',
  furnished: 'מרוהט',
  kitchen: 'מטבח',
  garden: 'גינה',
  pool: 'בריכה',
  gym: 'חדר כושר',
  doorman: 'סדרן כניסה',
  petsallowed: 'חיות מחמד',
  pets: 'חיות מחמד',
  forpartners: 'מתאים לשותפים',
  partners: 'מתאים לשותפים',
  roommates: 'מתאים לשותפים',
  longterm: 'לטווח ארוך',
  sublet: 'סאבלט',
  note: 'הערה',
  notes: 'הערה',
  items: 'פריטים',
  description: 'תיאור',
};

/** Yad2-style icons for the "מה יש בנכס?" grid. */
const ICONS: Record<string, LucideIcon> = {
  מעלית: ArrowUpCircle,
  מיזוג: Wind,
  'מזגן טורנדו': Fan,
  סורגים: Grid2X2,
  'ממ״ד': ShieldCheck,
  'דוד שמש': Sun,
  ריהוט: Armchair,
  מרוהט: Armchair,
  'דלתות רב בריח': DoorClosed,
  'גישה לנכים': Accessibility,
  משופץ: PaintRoller,
  מחסן: Warehouse,
  מרפסת: Package,
  'חיות מחמד': PawPrint,
  'מתאים לשותפים': Users,
  חניה: Car,
  'כניסה גמישה': Home,
  'לטווח ארוך': Home,
};


function normalizeKey(key: string) {
  return String(key)
    .replace(/^(is|include|includes|has|in|num_?of|number_?of|total)(?=[A-Z_])/, '')
    .replace(/[^A-Za-z\u0590-\u05FF0-9]/g, '')
    .toLowerCase();
}

/**
 * Hebrew-only display labels. Unknown English-only keys are never shown as
 * raw field names (`isRenovated`, `squareMeterBuild`, ...) — they are hidden.
 */
function label(key: string): string | null {
  const n = normalizeKey(key);
  if (LABELS[n]) return LABELS[n];
  const raw = String(key).replace(/_/g, ' ').trim();
  // Keep values that already arrive in Hebrew from the source.
  if (/[\u0590-\u05FF]/.test(raw)) return raw;
  return null;
}

function isBooleanish(v: unknown) {
  if (typeof v === 'boolean') return true;
  const s = String(v ?? '').trim();
  return s === 'יש' || s === 'אין' || s === 'true' || s === 'false' || s === 'כן' || s === 'לא';
}
function truthy(v: unknown) {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim();
  return s === 'יש' || s === 'true' || s === 'כן';
}

function formatDateish(v: unknown): string | null {
  const s = String(v ?? '');
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function renderValue(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'יש' : 'אין';
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ');
  const d = formatDateish(v);
  if (d) return d;
  return String(v ?? '');
}

type Entry = [string, unknown];

function entriesOf(obj: Record<string, unknown> | null | undefined): Entry[] {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj).filter(
    ([k, v]) => v !== null && v !== '' && v !== undefined && !HIDDEN_KEYS.has(normalizeKey(k)),
  );
}

export function PropertyRichDetailsCard({
  aboutText,
  furniture,
  additional,
  amenities,
  priceHistory,
  latitude,
  longitude,
  addressLabel,
}: Props) {
  // Only keys we can present with a real Hebrew label are rendered — raw
  // English field names must never reach the UI.
  const furnitureEntries = entriesOf(furniture)
    .map(([k, v]) => ({ key: k, name: label(k), value: v }))
    .filter((e): e is { key: string; name: string; value: unknown } => !!e.name);
  const rawAdditional = entriesOf(additional);
  const rawAmenities = entriesOf(amenities);

  // Yad2 splits the data in two: a value list ("פרטים נוספים") and a
  // boolean feature grid ("מה יש בנכס?"). Boolean-ish flags always move to
  // the grid, regardless of which source object they arrived in.
  const all: Entry[] = [...rawAdditional, ...rawAmenities];
  const seen = new Set<string>();
  const deduped = all
    .filter(([k]) => {
      const n = normalizeKey(k);
      if (seen.has(n)) return false;
      seen.add(n);
      return true;
    })
    .map(([k, v]) => ({ key: k, name: label(k), value: v }))
    .filter((e): e is { key: string; name: string; value: unknown } => !!e.name);

  const detailRows = deduped.filter(
    (e) => !isBooleanish(e.value) && e.name !== 'תיאור' && e.name !== 'הערה',
  );
  const featureFlags = deduped
    .filter((e) => isBooleanish(e.value))
    .map((e) => ({ name: e.name, on: truthy(e.value) }))
    .sort((a, b) => Number(b.on) - Number(a.on));


  const points = (priceHistory ?? []).filter((p) => p && p.price != null);
  const hasCoords = typeof latitude === 'number' && typeof longitude === 'number';

  if (
    !aboutText &&
    !furnitureEntries.length &&
    !detailRows.length &&
    !featureFlags.length &&
    !points.length &&
    !hasCoords
  ) {
    return null;
  }

  const chartData = points.map((p, i) => ({
    name: p.date || p.label || `#${i + 1}`,
    price: Number(p.price),
  }));

  const navUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
    : null;

  return (
    <Card className="p-4 sm:p-6 space-y-8" dir="rtl">
      {aboutText && (
        <section>
          <p className="text-lg leading-8 text-foreground/80 whitespace-pre-line">{aboutText}</p>
        </section>
      )}

      {furnitureEntries.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3 inline-flex items-center gap-2">
            <Sofa className="h-5 w-5 text-primary" /> פירוט הריהוט
          </h2>
          <dl className="divide-y divide-border/60">
            {furnitureEntries.map(({ key, name, value }) => (
              <div key={key} className="flex items-start justify-between gap-6 py-2.5">
                <dt className="text-lg text-muted-foreground">{name}</dt>
                <dd className="text-lg font-medium text-foreground text-left">{renderValue(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {detailRows.length > 0 && (
        <section>
          <dl className="divide-y divide-border/60">
            {detailRows.map(({ key, name, value }) => (
              <div key={key} className="flex items-start justify-between gap-6 py-2.5">
                <dt className="text-lg text-muted-foreground">{name}</dt>
                <dd className="text-lg font-medium text-foreground text-left">{renderValue(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {featureFlags.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">מה יש בנכס?</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            {featureFlags.map(({ name, on }) => {
              const Icon = ICONS[name] ?? Home;
              return (
                <div
                  key={name}
                  className={`flex items-center gap-3 ${on ? 'text-foreground' : 'text-muted-foreground/50 line-through decoration-1'}`}
                >
                  <Icon className="h-6 w-6 shrink-0" />
                  <span className="text-lg">{name}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {chartData.length > 1 && (
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3 inline-flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" /> הסטוריית שווי נכס
          </h2>
          <div className="h-48 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 15 }} />
                <YAxis tick={{ fontSize: 15 }} width={80} tickFormatter={(v) => `₪${Number(v).toLocaleString()}`} />
                <Tooltip formatter={(v) => `₪${Number(v).toLocaleString()}`} />
                <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {chartData.length === 1 && (
        <section className="text-lg">
          <span className="text-muted-foreground">מחיר קודם: </span>
          <span className="font-medium">₪{chartData[0].price.toLocaleString()}</span>
        </section>
      )}

      {hasCoords && (
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3 inline-flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" /> מיקום על המפה
          </h2>
          <div className="overflow-hidden rounded-lg border border-border/60">
            <iframe
              title="מפת הנכס"
              className="h-56 w-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://maps.google.com/maps?q=${latitude},${longitude}&z=16&output=embed`}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
              <a href={navUrl!} target="_blank" rel="noopener noreferrer">
                <Navigation className="h-5 w-5 ms-1" /> נווט לנכס
              </a>
            </Button>
            <span className="text-lg text-muted-foreground">
              {addressLabel || `${latitude?.toFixed(5)}, ${longitude?.toFixed(5)}`}
            </span>
          </div>
        </section>
      )}
    </Card>
  );
}

export default PropertyRichDetailsCard;
