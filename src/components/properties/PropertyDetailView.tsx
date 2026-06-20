import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  BedDouble, Ruler, MapPin, Calendar, Layers, Home, Receipt,
  Car, ArrowUpCircle, Wind, Shield, Sun, ExternalLink,
} from 'lucide-react';
import { PROPERTY_TYPE_LABELS_HE, type HomelyProperty } from '@/lib/homelyMockProperties';

type JsonRecord = Record<string, unknown>;

export type PropertyDetailViewData = {
  property: HomelyProperty;
  meta?: JsonRecord;
  amenities?: { parking?: number; elevator?: boolean; ac?: boolean; shelter?: boolean; solar?: boolean };
  neighborhood?: string | null;
  sourceUrl?: string | null;
};

const META_LABELS: Record<string, string> = {
  monthly_rent: 'שכר דירה חודשי',
  arnona_bimonthly: 'ארנונה (לחודשיים)',
  arnona: 'ארנונה',
  vaad_bayit: 'ועד בית',
  deposit: 'פיקדון',
};

function formatPrice(n: number) {
  return `₪${n.toLocaleString('he-IL')}`;
}
function formatMetaValue(key: string, value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'כן' : 'לא';
  if (typeof value === 'number') {
    if (/(rent|arnona|vaad|deposit|price)/i.test(key)) return `₪${value.toLocaleString('he-IL')}`;
    return value.toLocaleString('he-IL');
  }
  return String(value);
}

export function PropertyDetailView({ property, meta = {}, amenities, neighborhood, sourceUrl }: PropertyDetailViewData) {
  const [activePhoto, setActivePhoto] = useState(0);
  const photos = property.photos || [];
  const main = photos[activePhoto];

  const isRent = Number(property.price) < 50_000;
  const propertyTypeHe = PROPERTY_TYPE_LABELS_HE[property.property_type] || 'דירה';
  const transactionHe = isRent ? 'להשכרה' : 'למכירה';
  const headline = `${propertyTypeHe} ${transactionHe}, ${neighborhood || property.address || 'שכונה'}, ${property.city || 'עיר'}`;
  const pricePerMeter = property.size_sqm ? Math.round(property.price / property.size_sqm).toLocaleString('he-IL') : null;

  const vaadBayit = Number(meta.vaad_bayit ?? meta.vaad_monthly ?? 200) || 200;
  const arnonaBimonthly = Number(meta.arnona_bimonthly ?? meta.arnona ?? 800) || 800;
  const payments = Number(meta.payments ?? meta.payment_count ?? 12) || 12;
  const entryDate = String(meta.entry_date ?? meta.delivery_date ?? 'כניסה גמישה');

  const financialKeys = ['monthly_rent', 'arnona_bimonthly', 'arnona', 'vaad_bayit', 'deposit'];
  const financialEntries = financialKeys
    .filter((k) => meta[k] != null && meta[k] !== '')
    .map((k) => [k, meta[k]] as const);

  return (
    <div className="space-y-6" dir="rtl">
      <header className="space-y-2">
        <div className="mb-4 flex items-start gap-2">
          <a
            href={sourceUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { if (!sourceUrl) e.preventDefault(); }}
            aria-label="מעבר למקור המודעה"
            title={sourceUrl || 'אין קישור מקור'}
            className="inline-flex items-center justify-center p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full shrink-0 z-50"
            style={{ display: 'inline-flex', visibility: 'visible' }}
          >
            <ExternalLink className="w-5 h-5" />
          </a>
          <div
            role="heading"
            aria-level={1}
            className="text-xl font-bold text-right text-slate-900 block flex-1 leading-snug"
          >
            {headline}
          </div>
        </div>

        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-3xl font-extrabold text-success tabular-nums">
            {formatPrice(property.price)}
            {isRent && <span className="text-base font-normal text-muted-foreground"> /חודש</span>}
          </span>
          {pricePerMeter ? (
            <span className="text-xs text-muted-foreground font-normal">
              ({pricePerMeter} ₪ למ"ר)
            </span>
          ) : null}
        </div>
      </header>

      <div className="space-y-3">
        <Card className="overflow-hidden">
          <div className="aspect-[16/10] bg-muted relative">
            {main ? (
              <img src={main} alt={headline} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground">לא נמצאה תמונה במסד הנתונים</div>
            )}
          </div>
        </Card>
        {photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActivePhoto(i)}
                className={`relative h-20 w-32 shrink-0 overflow-hidden rounded-md border-2 transition-all ${
                  i === activePhoto ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                <img src={p} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <Card className="p-4 sm:p-5">
          <h2 className="text-base font-bold text-primary mb-4">מאפייני הנכס</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Spec icon={BedDouble} label="חדרים" value={property.rooms ? `${property.rooms}` : '—'} />
            <Spec icon={Ruler} label='שטח' value={property.size_sqm ? `${property.size_sqm} מ"ר` : '—'} />
            <Spec icon={Layers} label="קומה" value={property.floor != null ? `${property.floor}${property.total_floors ? ` / ${property.total_floors}` : ''}` : '—'} />
            <Spec icon={Calendar} label="שנת בנייה" value={property.year_built ? `${property.year_built}` : '—'} />
            <Spec icon={Home} label="סוג נכס" value={propertyTypeHe} />
            <Spec icon={MapPin} label="עיר" value={property.city || '—'} />
            <Spec icon={MapPin} label="שכונה" value={neighborhood || '—'} />

            <Spec icon={Receipt} label="ועד בית (לחודש)" value={`${vaadBayit.toLocaleString('he-IL')} ₪`} />
            <Spec icon={Receipt} label="ארנונה (לחודשיים)" value={`${arnonaBimonthly.toLocaleString('he-IL')} ₪`} />
            <Spec icon={Receipt} label="מספר תשלומים" value={`${payments}`} />
            <Spec icon={Car} label="חניות" value={`${amenities?.parking ?? 0}`} />
            <Spec icon={Calendar} label="תאריך כניסה" value={entryDate} />
            {amenities?.elevator && <Spec icon={ArrowUpCircle} label="מעלית" value="כן" />}
            {amenities?.ac && <Spec icon={Wind} label="מיזוג" value="כן" />}
            {amenities?.shelter && <Spec icon={Shield} label='ממ"ד / מקלט' value="כן" />}
            {amenities?.solar && <Spec icon={Sun} label="דוד שמש" value="כן" />}
          </div>

          {sourceUrl && (
            <div className="mt-5 pt-4 border-t border-border/60">
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                🔗 מעבר למקור המודעה
              </a>
            </div>
          )}
        </Card>

        {property.description && (
          <Card className="p-4 sm:p-5">
            <h2 className="text-base font-bold text-primary mb-2">תיאור הנכס</h2>
            <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-line">{property.description}</p>
          </Card>
        )}

        {financialEntries.length > 0 && (
          <Card className="p-4 sm:p-5">
            <h2 className="text-base font-bold text-primary mb-3 inline-flex items-center gap-2">
              <Receipt className="h-4 w-4" /> פרטים פיננסיים
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {financialEntries.map(([k, v]) => (
                <Spec key={k} icon={Receipt} label={META_LABELS[k] || k} value={formatMetaValue(k, v)} />
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function Spec({ icon: Icon, label, value }: { icon: typeof BedDouble; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}
