import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Sofa, ListChecks, TrendingUp, MapPin, Navigation } from 'lucide-react';
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

const KEY_LABELS: Record<string, string> = {
  elevator: 'מעלית',
  maalit: 'מעלית',
  parking: 'חניה',
  parkingQuantity: 'חניות',
  mamad: 'ממ״ד',
  shelter: 'ממ״ד',
  balcony: 'מרפסת',
  balconies: 'מרפסות',
  airConditioner: 'מיזוג',
  ac: 'מיזוג',
  bars: 'סורגים',
  renovated: 'משופצת',
  accessible: 'גישה לנכים',
  storage: 'מחסן',
  furniture: 'ריהוט',
  roomsCount: 'חדרים',
  squareMeter: 'מ״ר',
  floor: 'קומה',
  totalFloors: 'קומות בבניין',
  note: 'הערה',
  items: 'פריטים',
  condition: 'מצב הנכס',
  propertyCondition: 'מצב הנכס',
  entryDate: 'תאריך כניסה',
  availableFrom: 'תאריך כניסה',
  builtSquareMeter: 'מ״ר בנוי',
  buildingFloors: 'קומות בבניין',
  parkingSpaces: 'מקומות חניה',
  vaadBayit: 'ועד בית',
  vaad_bayit: 'ועד בית',
  arnona: 'ארנונה',
  payments: 'מספר תשלומים',
  solarHeater: 'דוד שמש',
  boiler: 'דוד שמש',
  securityDoor: 'דלתות ביטחון',
  safeRoom: 'ממ״ד',
  petsAllowed: 'מותר בע״ח',
  pets: 'מותר בע״ח',
  roommates: 'מתאים לשותפים',
  warehouse: 'מחסן',
  tadiran: 'מיזוג',
  longTerm: 'לטווח ארוך',
};

function label(key: string) {
  return KEY_LABELS[key] || key.replace(/_/g, ' ');
}

function renderValue(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'יש' : 'אין';
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ');
  return String(v ?? '');
}

function entriesOf(obj: Record<string, unknown> | null | undefined) {
  if (!obj || typeof obj !== 'object') return [] as Array<[string, unknown]>;
  return Object.entries(obj).filter(([, v]) => v !== null && v !== '' && v !== undefined);
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
  const additionalEntries = entriesOf(additional);
  const amenityEntries = entriesOf(amenities).filter(([, v]) => v !== false);
  const points = (priceHistory ?? []).filter((p) => p && p.price != null);
  const hasCoords = typeof latitude === 'number' && typeof longitude === 'number';

  if (
    !aboutText &&
    !furnitureEntries.length &&
    !additionalEntries.length &&
    !amenityEntries.length &&
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
    <Card className="p-4 sm:p-5 space-y-5" dir="rtl">
      {aboutText && (
        <section>
          <h2 className="text-2xl font-bold text-primary mb-2 inline-flex items-center gap-2">
            <FileText className="h-5 w-5" /> על הנכס
          </h2>
          <p className="text-xl leading-relaxed text-foreground/80 whitespace-pre-line">{aboutText}</p>
        </section>
      )}

      {furnitureEntries.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold text-primary mb-2 inline-flex items-center gap-2">
            <Sofa className="h-5 w-5" /> פירוט הריהוט
          </h2>
          <div className="flex flex-wrap gap-2">
            {furnitureEntries.map(([k, v]) => (
              <Badge key={k} variant="secondary" className="font-normal text-xl">
                {label(k)}: {renderValue(v)}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {additionalEntries.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold text-primary mb-2 inline-flex items-center gap-2">
            <ListChecks className="h-5 w-5" /> פרטים נוספים
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
            {additionalEntries.map(([k, v]) => (
              <div key={k} className="text-xl">
                <span className="text-muted-foreground">{label(k)}: </span>
                <span className="font-medium text-foreground">{renderValue(v)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {amenityEntries.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold text-primary mb-2 inline-flex items-center gap-2">
            <ListChecks className="h-5 w-5" /> מתקנים ותוספות
          </h2>
          <div className="flex flex-wrap gap-2">
            {amenityEntries.map(([k, v]) => (
              <Badge key={k} variant="outline" className="font-normal text-xl">
                {label(k)}
                {typeof v === 'boolean' ? '' : `: ${renderValue(v)}`}
              </Badge>
            ))}
          </div>
        </section>
      )}



      {chartData.length > 1 && (
        <section>
          <h2 className="text-2xl font-bold text-primary mb-2 inline-flex items-center gap-2">
            <TrendingUp className="h-5 w-5" /> היסטוריית מחיר
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
        <section className="text-xl">
          <span className="text-muted-foreground">מחיר קודם: </span>
          <span className="font-medium">₪{chartData[0].price.toLocaleString()}</span>
        </section>
      )}

      {hasCoords && (
        <section>
          <h2 className="text-2xl font-bold text-primary mb-2 inline-flex items-center gap-2">
            <MapPin className="h-5 w-5" /> מיקום על המפה
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
