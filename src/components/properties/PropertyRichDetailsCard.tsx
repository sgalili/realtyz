import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FileText, Sofa, TrendingUp, MapPin, Navigation,
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
  rooms: 'חדרים',
  roomscount: 'חדרים',
  מר: 'מ״ר בנוי סה״כ',
  squaremeter: 'מ״ר בנוי סה״כ',
  squaremeterbuild: 'מ״ר בנוי',
  builtsquaremeter: 'מ״ר בנוי',
  squaremetergarden: 'מ״ר גינה',
  balconiescount: 'מרפסות',
  balconies: 'מרפסות',
  buildingtopfloor: 'קומות בבניין',
  buildingfloors: 'קומות בבניין',
  totalfloors: 'קומות בבניין',
  floor: 'קומה',
  parkingquantity: 'חניות',
  parkingspaces: 'חניות',
  parking: 'חניה',
  vaadbayit: 'ועד בית לחודש',
  vaad: 'ועד בית לחודש',
  arnona: 'ארנונה',
  payments: 'מספר תשלומים',
  paymentscount: 'מספר תשלומים',
  entrancedate: 'תאריך כניסה',
  entrydate: 'תאריך כניסה',
  availablefrom: 'תאריך כניסה',
  propertycondition: 'מצב הנכס',
  condition: 'מצב הנכס',
  renovated: 'משופץ',
  new: 'חדש',
  // Amenity-style flags
  bars: 'סורגים',
  boiler: 'דוד שמש',
  solarheater: 'דוד שמש',
  elevator: 'מעלית',
  maalit: 'מעלית',
  airconditioner: 'מיזוג',
  ac: 'מיזוג',
  tornado: 'מזגן טורנדו',
  tadiran: 'מיזוג',
  mamad: 'ממ״ד',
  shelter: 'ממ״ד',
  saferoom: 'ממ״ד',
  securitydoor: 'דלתות רב בריח',
  handicapped: 'גישה לנכים',
  accessible: 'גישה לנכים',
  warehouse: 'מחסן',
  storage: 'מחסן',
  balcony: 'מרפסת',
  furniture: 'ריהוט',
  petsallowed: 'חיות מחמד',
  pets: 'חיות מחמד',
  forpartners: 'מתאים לשותפים',
  roommates: 'מתאים לשותפים',
  longterm: 'לטווח ארוך',
  note: 'הערה',
  items: 'פריטים',
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
  'דלתות רב בריח': DoorClosed,
  'גישה לנכים': Accessibility,
  משופץ: PaintRoller,
  מחסן: Warehouse,
  מרפסת: Package,
  'חיות מחמד': PawPrint,
  'מתאים לשותפים': Users,
  חניה: Car,
  'לטווח ארוך': Home,
};

function normalizeKey(key: string) {
  return String(key)
    .replace(/^(is|include|includes|has)(?=[A-Z_])/, '')
    .replace(/[^A-Za-z\u0590-\u05FF0-9]/g, '')
    .toLowerCase();
}

function label(key: string) {
  const n = normalizeKey(key);
  return LABELS[n] || String(key).replace(/_/g, ' ');
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
  const furnitureEntries = entriesOf(furniture);
  const rawAdditional = entriesOf(additional);
  const rawAmenities = entriesOf(amenities);

  // Yad2 splits the data in two: a value list ("פרטים נוספים") and a
  // boolean feature grid ("מה יש בנכס?"). Boolean-ish flags always move to
  // the grid, regardless of which source object they arrived in.
  const all: Entry[] = [...rawAdditional, ...rawAmenities];
  const seen = new Set<string>();
  const deduped = all.filter(([k]) => {
    const n = normalizeKey(k);
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });

  const detailRows = deduped.filter(([, v]) => !isBooleanish(v));
  const featureFlags = deduped
    .filter(([, v]) => isBooleanish(v))
    .map(([k, v]) => ({ name: label(k), on: truthy(v) }))
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
  const mapUrl = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    : null;

  return (
    <Card className="p-4 sm:p-6 space-y-8" dir="rtl">
      {aboutText && (
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3 inline-flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> על הנכס
          </h2>
          <p className="text-lg leading-8 text-foreground/80 whitespace-pre-line">{aboutText}</p>
        </section>
      )}

      {furnitureEntries.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3 inline-flex items-center gap-2">
            <Sofa className="h-5 w-5 text-primary" /> פירוט הריהוט
          </h2>
          <dl className="divide-y divide-border/60">
            {furnitureEntries.map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-6 py-2.5">
                <dt className="text-lg text-muted-foreground">{label(k)}</dt>
                <dd className="text-lg font-medium text-foreground text-left">{renderValue(v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {detailRows.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold text-foreground mb-3">פרטים נוספים</h2>
          <dl className="divide-y divide-border/60">
            {detailRows.map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-6 py-2.5">
                <dt className="text-lg text-muted-foreground">{label(k)}</dt>
                <dd className="text-lg font-medium text-foreground text-left">{renderValue(v)}</dd>
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
            <Button asChild size="sm" variant="outline">
              <a href={mapUrl!} target="_blank" rel="noopener noreferrer">
                פתח במפות
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
