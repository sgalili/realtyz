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
import { sanitizeSqm, sanitizeFloor, floorsInBuildingFromSqm } from '@/lib/propertyMeasures';

import WhatsAppIcon from '@/components/properties/WhatsAppIcon';
import TourSchedulerDialog from '@/components/properties/TourSchedulerDialog';
import { Button } from '@/components/ui/button';
import { CalendarClock } from 'lucide-react';

import {
  Loader2, MapPin, Home, Ruler, Bed, Building2, Car, Layers,
  ArrowUpCircle, Sun, Wind, Shield, ImageIcon, ChevronLeft, ChevronRight,
  BarChart3, GraduationCap, Trees, HeartPulse, TrainFront, Waves,
} from 'lucide-react';
import PropertyFeatureBadges from '@/components/properties/PropertyFeatureBadges';
import { officialWaLink } from '@/lib/officialWa';

type SharedPayload = {
  workspace_name: string | null;
  agency_name?: string | null;
  area_facts?: AreaFacts | null;
  logo_url?: string | null;
  owner_wa?: string | null;
  owner_name?: string | null;
  broker_wa: string | null;
  property: any | null;
};

type AreaFacts = {
  city: string;
  neighborhood: string | null;
  dealType: 'sale' | 'rent';
  sampleSize: number;
  avgPrice: number | null;
  medianPrice: number | null;
  avgPricePerSqm: number | null;
  avgRooms: number | null;
  avgSqm: number | null;
};

/** Buckets for the "מה יש בסביבה הקרובה" list, mirroring the internal view. */
const PERK_BUCKETS = [
  { label: 'גנים, בתי ספר ומוסדות חינוך', icon: GraduationCap, re: /גן|גני|בית ספר|בתי ספר|תיכון|חינוך|מעון|אוניברסיט|מכלל/ },
  { label: 'פארקים ושטחים ירוקים', icon: Trees, re: /פארק|גינה|שטח ירוק|טיילת|מגרש משחקים|ספורט|פנאי/ },
  { label: 'בריאות ומרפאות', icon: HeartPulse, re: /מרפא|קופת חולים|בית חולים|רפוא|חירום/ },
  { label: 'צירים ראשיים וכבישים', icon: Car, re: /כביש|איילון|מחלף|צומת|כניסה לעיר|חני/ },
  { label: 'תחבורה ציבורית ורכבת', icon: TrainFront, re: /רכבת|אוטובוס|תחבורה|רכבת קלה|תחנת/ },
  { label: 'מרחק מהים', icon: Waves, re: /ים|חוף|מרינה/ },
] as const;

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

  const specs: { label: string; value: string; icon: any }[] = [];
  if (Number(p.rooms) > 0) specs.push({ label: 'חדרים', value: String(p.rooms), icon: Bed });
  const sharedSqm = sanitizeSqm(p.sqm);
  const sharedFloorsInBuilding = (p as any).floors_in_building ?? floorsInBuildingFromSqm(p.sqm);
  if (sharedSqm) specs.push({ label: 'מ״ר בנוי', value: `${sharedSqm} מ״ר`, icon: Ruler });
  if (p.floor != null && p.floor !== '') specs.push({ label: 'קומה', value: String(sanitizeFloor(p.floor) ?? p.floor), icon: Layers });
  if (sharedFloorsInBuilding) specs.push({ label: 'קומות בבניין', value: String(sharedFloorsInBuilding), icon: Building2 });

  if (p.neighborhood) specs.push({ label: 'שכונה', value: String(p.neighborhood), icon: MapPin });
  if (p.city) specs.push({ label: 'עיר', value: String(p.city), icon: Building2 });
  if (p.project_name) specs.push({ label: 'פרויקט', value: String(p.project_name), icon: Home });

  const facts = data?.area_facts ?? null;
  const perkList: string[] = Array.isArray(p.area_perks?.perks) ? p.area_perks.perks : [];
  const perkBuckets = PERK_BUCKETS
    .map((b) => ({ ...b, items: perkList.filter((x) => b.re.test(x)) }))
    .filter((b) => b.items.length > 0);

  // HARD RULE: public property pages always open our official Meta WBA number,
  // never the owner's / broker's personal WhatsApp.
  const waHref = officialWaLink(
    `שלום, ראיתי את הנכס "${displayTitle}" ואשמח לקבל פרטים נוספים.`,
  );




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
              {data?.agency_name || data?.workspace_name || 'Realtyz'}
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



        {specs.length > 0 ? (
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {specs.map((sp) => (
              <Spec key={sp.label} icon={sp.icon} label={sp.label} value={sp.value} />
            ))}
          </section>
        ) : null}

        <PropertyFeatureBadges
          sources={[features, p.attributes, p.additional_details, p.source_metadata]}
          flags={{ elevator: p.elevator, parking: p.parking }}
        />

        {facts ? (
          <Card className="p-4 sm:p-5" dir="rtl">
            <h2 className="mb-3 inline-flex items-center gap-2 text-2xl font-bold text-foreground">
              <BarChart3 className="h-5 w-5 text-primary" /> נתוני שוק באזור
            </h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ['מחיר ממוצע', facts.avgPrice ? `₪${facts.avgPrice.toLocaleString('he-IL')}` : null],
                ['מחיר חציוני', facts.medianPrice ? `₪${facts.medianPrice.toLocaleString('he-IL')}` : null],
                ['מחיר למ״ר', facts.avgPricePerSqm ? `₪${facts.avgPricePerSqm.toLocaleString('he-IL')}` : null],
                ['שטח ממוצע', facts.avgSqm ? `${facts.avgSqm} מ״ר` : null],
                ['חדרים בממוצע', facts.avgRooms ? String(facts.avgRooms) : null],
                ['מדגם נכסים', facts.sampleSize ? String(facts.sampleSize) : null],
              ].filter(([, v]) => !!v).map(([k, v]) => (
                <div key={String(k)} className="rounded-lg border bg-muted/30 px-3 py-2">
                  <dt className="text-[13px] text-muted-foreground">{k}</dt>
                  <dd className="text-[16px] font-semibold text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[13px] text-muted-foreground">
              {facts.city}
              {facts.neighborhood ? ` · ${facts.neighborhood}` : ''} · {facts.dealType === 'rent' ? 'שכירות' : 'מכירה'}
            </p>
          </Card>
        ) : null}

        {perkBuckets.length > 0 ? (
          <Card className="p-4 sm:p-5" dir="rtl">
            <h2 className="mb-3 inline-flex items-center gap-2 text-2xl font-bold text-foreground">
              <MapPin className="h-5 w-5 text-primary" /> מה יש בסביבה הקרובה
            </h2>
            <div className="space-y-4">
              {perkBuckets.map(({ label, icon: Icon, items }) => (
                <div key={label}>
                  <p className="mb-1 inline-flex items-center gap-2 text-[16px] font-semibold text-slate-900">
                    <Icon className="h-5 w-5 text-primary" /> {label}
                  </p>
                  <ul className="ms-7 list-disc space-y-1 text-[15px] text-muted-foreground">
                    {items.map((it, i) => <li key={i}>{it}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
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

        <div className="sticky bottom-4 flex items-stretch gap-2 pt-2">
          <Button
            type="button"
            onClick={() => setTourOpen(true)}
            className="h-14 flex-1 gap-2 rounded-xl text-[18px] font-bold shadow-lg"
          >
            <CalendarClock className="h-6 w-6" />
            תאם סיור
          </Button>
          {waHref ? (
            <a
              href={waHref}
              target="_blank"
              rel="noreferrer"
              aria-label="דברו איתי"
              style={{ backgroundColor: '#25D366' }}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl text-[18px] font-bold text-white shadow-lg transition hover:brightness-95"
            >
              <WhatsAppIcon className="h-6 w-6" />
              דברו איתי
            </a>
          ) : null}
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
