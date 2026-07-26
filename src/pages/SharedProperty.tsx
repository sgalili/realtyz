/**
 * SharedProperty
 * ---------------
 * Public, auth-free property page for share links minted by the
 * `create-property-share` edge function. Mirrors the internal property
 * template (gallery, spec grid, amenities, rich metadata) minus private data
 * such as house / apartment numbers.
 * Route: /share/property/:token
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import PropertyRichDetailsCard from '@/components/properties/PropertyRichDetailsCard';
import WhatsAppIcon from '@/components/properties/WhatsAppIcon';
import {
  Loader2, MapPin, Home, Ruler, Bed, Building2, Car,
  ArrowUpCircle, Sun, Wind, Shield, ImageIcon,
} from 'lucide-react';

type SharedPayload = {
  workspace_name: string | null;
  logo_url?: string | null;
  owner_wa?: string | null;
  owner_name?: string | null;
  broker_wa: string | null;
  property: any | null;
};

function normalizeWA(raw?: string | null) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return '972' + digits.slice(1);
  return digits;
}

/** Public pages must never expose house / apartment numbers. */
function publicAddress(raw?: string | null) {
  if (!raw) return '';
  return String(raw)
    .replace(/\b(דירה|דירת|כניסה|קומה)\s*\d+[א-ת]?\b/g, '')
    .replace(/[,\/]\s*\d+[א-ת]?\s*$/g, '')
    .replace(/\s\d+[א-ת]?\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[,\s]+$/g, '')
    .trim();
}

function Spec({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
      <Icon className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0">
        <div className="text-[13px] text-muted-foreground">{label}</div>
        <div className="truncate text-[16px] font-semibold text-slate-900">{value}</div>
      </div>
    </div>
  );
}

export default function SharedProperty() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/share-property-view?token=${encodeURIComponent(token)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error((await res.json())?.error || 'שגיאה בטעינת הנכס');
        setData(await res.json());
      } catch (e: any) {
        setError(e?.message ?? 'שגיאה בטעינה');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const p = data?.property;

  const photos: string[] = useMemo(() => {
    if (!p) return [];
    const all = (Array.isArray(p.media_photos) ? p.media_photos : [])
      .concat(Array.isArray(p.photos) ? p.photos : [])
      .filter((s: any) => typeof s === 'string' && s);
    return Array.from(new Set(all));
  }, [p]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !p) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6" dir="rtl">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            {error || 'הקישור לא זמין או פג תוקף.'}
          </p>
        </div>
      </div>
    );
  }

  const price = Number(p.asking_price ?? p.price ?? 0) || 0;
  const isRent = String(p.deal_type ?? p.transaction_type ?? '').toLowerCase() === 'rent'
    || (price > 0 && price < 50_000);
  const priceStr = price
    ? `₪${price.toLocaleString('he-IL')}${isRent ? ' /חודש' : ''}`
    : 'לפרטים';
  const pricePerMeter = price && Number(p.sqm) > 0 && !isRent
    ? Math.round(price / Number(p.sqm)).toLocaleString('he-IL')
    : null;

  const features = (p.features && typeof p.features === 'object' && !Array.isArray(p.features))
    ? (p.features as Record<string, any>) : {};
  const addr = publicAddress(p.address);
  const locationLine = [addr, p.neighborhood, p.city].filter(Boolean).join(' · ');
  const about = p.long_description || p.description || p.short_description || null;

  const wa = normalizeWA(data?.owner_wa) ?? normalizeWA(data?.broker_wa);
  const waMsg = encodeURIComponent(
    `שלום, ראיתי את הנכס "${p.property_title ?? p.title ?? ''}" ואשמח לקבל פרטים נוספים.`,
  );
  const waHref = wa ? `https://wa.me/${wa}?text=${waMsg}` : null;

  const WaButton = ({ compact }: { compact?: boolean }) =>
    waHref ? (
      <a
        href={waHref}
        target="_blank"
        rel="noreferrer"
        aria-label="שיחת WhatsApp"
        style={{ backgroundColor: '#25D366' }}
        className={
          compact
            ? 'inline-flex items-center gap-2 rounded-full px-3 py-2 text-[14px] font-semibold text-white shadow-sm transition hover:brightness-95'
            : 'flex h-14 w-full items-center justify-center gap-2 rounded-xl text-[18px] font-bold text-white shadow-lg transition hover:brightness-95'
        }
      >
        <WhatsAppIcon className={compact ? 'h-5 w-5' : 'h-6 w-6'} />
        {compact ? <span className="hidden sm:inline">WhatsApp</span> : 'שלחו לי פרטים ב-WhatsApp'}
      </a>
    ) : null;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="relative mx-auto flex max-w-4xl items-center justify-center px-4 py-3">
          <div className="flex items-center gap-3">
            {data?.logo_url ? (
              <img
                src={data.logo_url}
                alt={data.workspace_name || 'לוגו'}
                className="h-11 w-auto object-contain"
                onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
              />
            ) : null}
            <h1 className="text-center text-[18px] font-bold text-slate-900">
              {data?.workspace_name || 'Realtyz'}
            </h1>
          </div>
          <div className="absolute left-4 top-1/2 -translate-y-1/2">
            <WaButton compact />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={isRent ? 'bg-sky-600 text-white' : 'bg-emerald-600 text-white'}>
              {isRent ? 'להשכרה' : 'למכירה'}
            </Badge>
            {p.project_name ? <Badge variant="outline">{p.project_name}</Badge> : null}
          </div>
          <h2 className="text-[26px] font-bold leading-snug text-slate-900">
            {p.property_title ?? p.title ?? 'נכס'}
          </h2>
          {locationLine ? (
            <p className="inline-flex items-center gap-1.5 text-[17px] text-slate-600">
              <MapPin className="h-5 w-5 text-primary" />
              {locationLine}
            </p>
          ) : null}
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-[34px] font-extrabold tabular-nums text-emerald-600">{priceStr}</span>
            {pricePerMeter ? (
              <span className="text-[15px] text-muted-foreground">({pricePerMeter} ₪ למ״ר)</span>
            ) : null}
          </div>
        </section>

        {photos.length > 0 ? (
          <section className="space-y-2">
            <button
              type="button"
              onClick={() => setLightbox(photos[0])}
              className="block w-full overflow-hidden rounded-xl"
            >
              <img
                src={photos[0]}
                alt={p.property_title ?? 'נכס'}
                className="h-80 w-full object-cover transition hover:scale-[1.01]"
                onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
              />
            </button>
            {photos.length > 1 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.slice(1).map((src, i) => (
                  <button key={i} type="button" onClick={() => setLightbox(src)} className="overflow-hidden rounded-lg">
                    <img
                      src={src}
                      alt=""
                      loading="lazy"
                      className="h-28 w-full object-cover transition hover:opacity-90"
                      onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                    />
                  </button>
                ))}
              </div>
            )}
            <p className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <ImageIcon className="h-4 w-4" /> {photos.length} תמונות
            </p>
          </section>
        ) : null}

        <Card className="space-y-3 p-4 sm:p-5">
          <h3 className="text-[19px] font-bold text-primary">נתוני הנכס</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {p.rooms ? <Spec icon={Bed} label="חדרים" value={String(p.rooms)} /> : null}
            {(p.sqm ?? p.size_sqm) ? <Spec icon={Ruler} label='מ״ר' value={String(p.sqm ?? p.size_sqm)} /> : null}
            {p.floor != null ? <Spec icon={Building2} label="קומה" value={String(p.floor)} /> : null}
            {(p.parking ?? features.parking) != null
              ? <Spec icon={Car} label="חניות" value={String(p.parking ?? features.parking)} /> : null}
            {(p.elevator ?? features.elevator) ? <Spec icon={ArrowUpCircle} label="מעלית" value="כן" /> : null}
            {features.balcony ? <Spec icon={Sun} label="מרפסת" value="כן" /> : null}
            {features.ac ? <Spec icon={Wind} label="מיזוג" value="כן" /> : null}
            {(features.shelter || features.mamad) ? <Spec icon={Shield} label='ממ״ד / מקלט' value="כן" /> : null}
            {features.solar ? <Spec icon={Sun} label="דוד שמש" value="כן" /> : null}
            {!p.rooms && !p.sqm && p.floor == null ? (
              <div className="col-span-full inline-flex items-center gap-2 text-[15px] text-muted-foreground">
                <Home className="h-5 w-5" /> פרטים נוספים אצל הסוכן
              </div>
            ) : null}
          </div>
        </Card>

        <PropertyRichDetailsCard
          aboutText={about}
          furniture={p.furniture_details ?? null}
          additional={p.additional_details ?? null}
          amenities={Object.keys(features).length ? features : null}
          priceHistory={Array.isArray(p.price_history) ? p.price_history : []}
          latitude={p.latitude != null ? Number(p.latitude) : null}
          longitude={p.longitude != null ? Number(p.longitude) : null}
          addressLabel={[addr, p.neighborhood, p.city].filter(Boolean).join(', ')}
        />

        {waHref && (
          <div className="sticky bottom-4 pt-2">
            <WaButton />
          </div>
        )}
      </main>

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-4xl p-2">
          {lightbox ? <img src={lightbox} alt="" className="max-h-[80vh] w-full rounded-lg object-contain" /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
