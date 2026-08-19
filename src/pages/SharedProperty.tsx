/**
 * SharedProperty
 * ---------------
 * Public, auth-free property page for share links minted by the
 * `create-property-share` edge function. Mirrors the internal property
 * template (gallery, spec grid, amenities, rich metadata) minus private data
 * such as house / apartment numbers.
 * Route: /share/property/:token
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import PropertyRichDetailsCard from '@/components/properties/PropertyRichDetailsCard';
import WhatsAppIcon from '@/components/properties/WhatsAppIcon';
import TourSchedulerDialog from '@/components/properties/TourSchedulerDialog';
import { Button } from '@/components/ui/button';
import { CalendarClock } from 'lucide-react';

import {
  Loader2, MapPin, Home, Ruler, Bed, Building2, Car,
  ArrowUpCircle, Sun, Wind, Shield, ImageIcon, ChevronLeft, ChevronRight,
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
    .replace(/\b(דירה|דירת|ד['׳"]|כניסה|קומה|בית|מספר)\s*\d+[א-ת]?\b/g, '')
    .replace(/[,/]\s*\d+[א-ת]?\s*$/g, '')
    .replace(/\s\d+[א-ת]?\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\bד['׳"]\b/g, '')
    .replace(/[,\s]+$/g, '')
    .trim();
}

function publicTitle(raw?: string | null) {
  return publicAddress(raw)
    .replace(/\s*[,·]\s*[,·]/g, ' · ')
    .replace(/[\s,·]+$/g, '')
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
  const [tourOpen, setTourOpen] = useState(false);


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

  // Horizontal slideshow state for the public gallery.
  const [slide, setSlide] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const goToSlide = (next: number) => {
    const total = photos.length;
    if (total === 0) return;
    const target = ((next % total) + total) % total;
    setSlide(target);
    const el = trackRef.current;
    const child = el?.children?.[target] as HTMLElement | undefined;
    if (child) child.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };



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
  const displayTitle = publicTitle(p.property_title ?? p.title ?? p.address ?? 'נכס') || 'נכס';
  const about = p.long_description || p.description || p.short_description || null;

  const wa = normalizeWA(data?.owner_wa) ?? normalizeWA(data?.broker_wa);
  const waMsg = encodeURIComponent(
    `שלום, ראיתי את הנכס "${displayTitle}" ואשמח לקבל פרטים נוספים.`,
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
            {displayTitle}
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
            <div className="relative overflow-hidden rounded-xl bg-muted">
              <div
                className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth"
                style={{ scrollbarWidth: 'none' }}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  const idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
                  setSlide(Math.min(photos.length - 1, Math.max(0, Math.abs(idx))));
                }}
                ref={trackRef}
              >
                {photos.map((src, i) => (
                  <button
                    key={`${src}-${i}`}
                    type="button"
                    onClick={() => setLightbox(src)}
                    className="min-w-full shrink-0 snap-center"
                  >
                    <img
                      src={src}
                      alt={i === 0 ? displayTitle : ''}
                      loading={i === 0 ? 'eager' : 'lazy'}
                      className="h-80 w-full object-cover"
                      onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                    />
                  </button>
                ))}
              </div>

              {photos.length > 1 ? (
                <>
                  <button
                    type="button"
                    aria-label="התמונה הקודמת"
                    onClick={() => goToSlide(slide - 1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 text-slate-900 shadow-md transition hover:bg-white"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="התמונה הבאה"
                    onClick={() => goToSlide(slide + 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 text-slate-900 shadow-md transition hover:bg-white"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-semibold text-white tabular-nums">
                    {slide + 1} / {photos.length}
                  </div>
                </>
              ) : null}
            </div>

            {photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.map((src, i) => (
                  <button
                    key={`thumb-${i}`}
                    type="button"
                    onClick={() => goToSlide(i)}
                    className={`h-20 w-28 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                      i === slide ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={src}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
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

        <div className="sticky bottom-4 space-y-2 pt-2">
          <Button
            type="button"
            onClick={() => setTourOpen(true)}
            className="h-14 w-full gap-2 rounded-xl text-[18px] font-bold shadow-lg"
          >
            <CalendarClock className="h-6 w-6" />
            תאם סיור
          </Button>
          {waHref && <WaButton />}
        </div>
      </main>

      <TourSchedulerDialog
        open={tourOpen}
        onOpenChange={setTourOpen}
        token={token ?? ''}
        propertyTitle={displayTitle}
      />

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-4xl p-2">
          {lightbox ? <img src={lightbox} alt="" className="max-h-[80vh] w-full rounded-lg object-contain" /> : null}
        </DialogContent>
      </Dialog>

    </div>
  );
}
