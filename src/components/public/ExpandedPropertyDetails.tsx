import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { cloneElement, isValidElement, useEffect, type ReactElement, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { LucideIcon } from 'lucide-react';
import {
  Heart, X, Accessibility, Armchair, Award, BadgeCheck, Banknote, Bath, Building, Building2, Bus, CalendarDays, Car, CarFront,
  CheckCircle2, Compass, DoorOpen, Dog, Fence, Flame, GraduationCap, Home, Layers, Loader2, MapPin, Maximize2,
  Navigation, Package, Receipt, Ruler, School, ShieldCheck, Snowflake, Sparkles, Store, Trees, Utensils, Wallet, Wrench,
} from 'lucide-react';
import { normalizeListing } from '@/pages/PublicListingPage';
import BrokerAttribution from '@/components/properties/BrokerAttribution';
import PropertyContactActions from './PropertyContactActions';
import { publicUrl } from '@/lib/publicUrl';

type Raw = Record<string, unknown>;
type Spec = { icon: LucideIcon; label: string; value: string };

const asObj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const hebrew = (v: unknown) => (typeof v === 'string' && /[\u0590-\u05FF]/.test(v) ? v.trim() : '');
const dateHe = (v: unknown) => {
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
};
const ils = (n: number) => `₪${n.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;

const AMENITIES: Array<[string, string, LucideIcon]> = [
  ['includeElevator', 'מעלית', Building],
  ['includeParking', 'חניה', Car],
  ['includeSecurityRoom', 'ממ״ד', ShieldCheck],
  ['includeFloorShelter', 'מקלט קומתי', ShieldCheck],
  ['includeBuildingShelter', 'מקלט בבניין', ShieldCheck],
  ['includeBalcony', 'מרפסת', DoorOpen],
  ['includeWarehouse', 'מחסן', Package],
  ['includeAirconditioner', 'מיזוג אוויר', Snowflake],
  ['includeBoiler', 'דוד שמש', Flame],
  ['includeFurniture', 'מרוהט', Armchair],
  ['includeBars', 'סורגים', Fence],
  ['includeRavBariach', 'דלת רב בריח', ShieldCheck],
  ['includeTornado', 'מזגן טורנדו', Snowflake],
  ['isHandicapped', 'גישה לנכים', Accessibility],
  ['isRenovated', 'משופץ', Wrench],
  ['isKitchenKosher', 'מטבח כשר', Utensils],
  ['isPetsAllowed', 'מותר בעלי חיים', Dog],
  ['isPillarBuilding', 'בניין על עמודים', Building2],
  ['isAssetExclusive', 'בבלעדיות', Award],
];

function perkIcon(text: string): LucideIcon {
  if (/גן|גני|ילדים/.test(text)) return Sparkles;
  if (/ספר|חינוך|תיכון|אוניברסיט|מכלל/.test(text)) return GraduationCap;
  if (/אוטובוס|רכבת|תחבור|כביש|קו |נתיב/.test(text)) return Bus;
  if (/פארק|גינ|ים|חוף|טבע|שביל/.test(text)) return Trees;
  if (/קניון|מסחר|חנו|מרכז/.test(text)) return Store;
  if (/חני/.test(text)) return CarFront;
  return MapPin;
}

function perkGroup(text: string): 'edu' | 'transport' | 'other' {
  if (/גן|גני|ספר|חינוך|תיכון|אוניברסיט|מכלל/.test(text)) return 'edu';
  if (/אוטובוס|רכבת|תחבור|כביש|נתיב/.test(text)) return 'transport';
  return 'other';
}

export default function ExpandedPropertyDetails({ idOrSlug, isFav = false, onFavorite, onClose, gallery }: { idOrSlug: string; isFav?: boolean; onFavorite?: () => void; onClose?: () => void; gallery?: ReactNode }) {
  useEffect(() => { void (supabase as any).rpc('track_listing_view', { _id_or_slug: idOrSlug }); }, [idOrSlug]);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['public-listing-expanded', idOrSlug],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-listing-view?id=${encodeURIComponent(idOrSlug)}`;
      const res = await fetch(endpoint, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } });
      if (!res.ok) return null;
      const payload = await res.json();
      if (!payload?.property) return null;
      return { listing: normalizeListing(payload.property, payload.attribution), raw: payload.property as Raw };
    },
  });

  const listingId = (data?.raw?.id as string | undefined) ?? null;
  const hasPerks = Array.isArray(asObj(data?.raw?.area_perks).perks) && (asObj(data?.raw?.area_perks).perks as unknown[]).length > 0;
  useEffect(() => {
    if (!listingId || hasPerks) return;
    const key = `realtyz:perks-req:${listingId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    void supabase.functions.invoke('neighborhood-perks', { body: { listing_id: listingId } }).then(({ data: r }) => {
      if ((r as any)?.area_perks) void refetch();
    });
  }, [listingId, hasPerks]);
  if (isLoading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!data) return null;
  const { listing, raw } = data;
  const f0 = asObj(raw.features);
  // Map the publisher's own fields (manual ads) onto the same display keys Yad2 imports use.
  const own: Raw = {};
  const put = (k: string, v: unknown) => { if (v !== undefined && v !== null && v !== '') own[k] = v; };
  put('text', f0.property_type); put('buildingTopFloor', f0.total_floors); put('propertyCondition', f0.condition);
  put('arnona', f0.arnona); put('vaadBayit', f0.vaad_bayit); put('squareMeterBuild', f0.built_sqm); put('squareMeterGarden', f0.garden_sqm);
  put('entranceDate', f0.entry_date); put('airDirections', f0.air_directions);
  if (f0.elevator === true || raw.elevator === true) own.includeElevator = true;
  if (f0.parking === true || raw.parking === true) own.includeParking = true;
  if (f0.balcony === true) own.includeBalcony = true;
  if (f0.open_view === true) own.openView = true;
  const a: Raw = { ...own, ...asObj(raw.additional_details), ...asObj(raw.attributes) };

  const rooms = num(a.roomsCount) ?? num(raw.rooms);
  const total = num(a.squareMeter) ?? num(raw.sqm);
  const built = num(a.squareMeterBuild);
  const garden = num(a.squareMeterGarden);
  const floorRaw = a.floor ?? raw.floor;
  const floorN = Number(floorRaw);
  const topFloor = num(a.buildingTopFloor) ?? num(a.totalFloors) ?? num(a.floors_in_building);
  const floor = floorRaw !== undefined && floorRaw !== null && floorRaw !== '' && Number.isFinite(floorN)
    ? `${floorN === 0 ? 'קרקע' : floorN}${topFloor ? ` מתוך ${topFloor}` : ''}` : '';
  const parkingCount = num(a.parkingSpacesCount);
  const payments = num(a.paymentsCount);
  const arnona = num(a.arnona);
  const vaad = num(a.vaadBayit);
  const entrance = a.isImmediateEntrance === true ? 'מיידית' : dateHe(a.entranceDate ?? raw.available_from);

  const specs = ([
    { icon: Home, label: 'סוג נכס', value: hebrew(a.text) || hebrew(raw.property_type) },
    rooms && { icon: DoorOpen, label: 'חדרים', value: String(rooms) },
    total && { icon: Maximize2, label: 'שטח כולל', value: `${total} מ״ר` },
    built && { icon: Ruler, label: 'שטח בנוי', value: `${built} מ״ר` },
    garden && { icon: Trees, label: 'שטח גינה', value: `${garden} מ״ר` },
    floor && { icon: Layers, label: 'קומה', value: floor },
    entrance && { icon: CalendarDays, label: 'כניסה', value: a.isEnterDateFlexible === true ? `${entrance} (גמיש)` : entrance },
    parkingCount && { icon: Car, label: 'מקומות חניה', value: String(parkingCount) },
    a.includeParking !== undefined && { icon: CarFront, label: 'חניה כלולה', value: a.includeParking ? 'כן' : 'לא' },
    num(a.balconiesCount) && { icon: DoorOpen, label: 'מרפסות', value: String(num(a.balconiesCount)) },
    arnona && { icon: Receipt, label: 'ארנונה', value: `${ils(arnona)} לחודשיים` },
    vaad && { icon: Wallet, label: 'ועד בית', value: `${ils(vaad)} לחודש` },
    payments && { icon: Banknote, label: 'תשלומים', value: String(payments) },
    hebrew(a.airDirections) && { icon: Compass, label: 'כיווני אוויר', value: hebrew(a.airDirections) },
    a.openView === true && { icon: Sparkles, label: 'נוף', value: 'נוף פתוח' },
    hebrew(a.propertyCondition) && { icon: BadgeCheck, label: 'מצב הנכס', value: hebrew(a.propertyCondition) },
    num(a.shelterDistance) && { icon: ShieldCheck, label: 'מרחק למקלט', value: `${num(a.shelterDistance)} מ׳` },
  ].filter((s) => s && (s as Spec).value && !['חדרים', 'שטח כולל', 'קומה'].includes((s as Spec).label)) as Spec[]);

  const amenities = AMENITIES.filter(([key]) => a[key] === true).map(([, label, icon]) => ({ label, icon }));
  const features = asObj(raw.features);
  const tags = Array.from(new Set([
    ...Object.entries(features).filter(([k, v]) => /[\u0590-\u05FF]/.test(k) && v !== false && !/^\d/.test(k)).map(([k]) => k.trim()),
    ...(Array.isArray(a.tags) ? (a.tags as unknown[]).map(hebrew).filter(Boolean) : []),
  ])).filter((t) => !amenities.some((am) => am.label === t));

  const perksObj = asObj(raw.area_perks);
  const oneLiner = hebrew(perksObj.one_liner_he);
  const perks = (Array.isArray(perksObj.perks) ? perksObj.perks : []).map(hebrew).filter(Boolean) as string[];
  const perkSections = [
    { title: 'חינוך', icon: School, items: perks.filter((p) => perkGroup(p) === 'edu') },
    { title: 'תחבורה', icon: Bus, items: perks.filter((p) => perkGroup(p) === 'transport') },
    { title: 'יתרונות הסביבה', icon: Compass, items: perks.filter((p) => perkGroup(p) === 'other') },
  ].filter((s) => s.items.length);

  const rawDesc = hebrew(a.description) && hebrew(a.description).length > listing.description.length ? hebrew(a.description) : listing.description;
  const titleStr = typeof raw.property_title === 'string' ? raw.property_title.trim() : '';
  const descTrim = (rawDesc || '').trim();
  const isStub = !descTrim || descTrim.length < 40 && /^[^\n]*\s·\s[^\n]*$/.test(descTrim);
  const description = !isStub && descTrim !== titleStr && descTrim !== listing.title ? descTrim : '';
  const hasCoords = listing.latitude !== null && listing.longitude !== null;
  const mapQuery = hasCoords ? `${listing.latitude},${listing.longitude}` : listing.addressForMap;
  const wazeUrl = hasCoords
    ? `https://waze.com/ul?ll=${listing.latitude},${listing.longitude}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(mapQuery)}&navigate=yes`;
  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapQuery)}`;
  const embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&hl=iw&z=16&output=embed`;

  const overlay = (onFavorite || listing.id) ? (
    <>
      {onFavorite && (
        <Button type="button" variant="secondary" size="icon" onClick={(e) => { e.stopPropagation(); onFavorite(); }} aria-pressed={isFav} aria-label={isFav ? 'הסרה מהמועדפים' : 'שמירה במועדפים'} title="מועדפים" className="h-9 w-9 border-0 bg-transparent shadow-none hover:bg-muted">
          <Heart className={`h-4 w-4 text-destructive ${isFav ? 'fill-current' : ''}`} />
        </Button>
      )}
      {listing.id && <div className="[&_button]:border-0 [&_button]:bg-transparent [&_button]:shadow-none"><PropertyContactActions listingId={listing.id} title={listing.title} shareUrl={publicUrl(`/p/${encodeURIComponent(listing.slug || listing.id)}`)} compact shareOnly /></div>}
    </>
  ) : null;
  const galleryEl = isValidElement(gallery) ? cloneElement(gallery as ReactElement<{ overlay?: ReactNode }>, { overlay }) : gallery;

  return (
    <div dir="rtl" className="min-w-0 max-w-full space-y-5 text-base [container-type:inline-size]">
      <header className="min-w-0 space-y-3 pb-1">
        {onClose && (
          <div className="flex items-center justify-start">
            <Button type="button" variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="סגירת פרטי הנכס" title="סגירה">
              <X className="h-5 w-5" />
            </Button>
          </div>
        )}
        <BrokerAttribution compact brokerName={listing.brokerName} officeName={listing.officeName} licenceNumber={listing.brokerLicenceNumber} logoUrl={listing.agencyLogoUrl} publisherKind={listing.publisherKind} dealType={listing.dealType} exclusive={a.isAssetExclusive === true} />
        {galleryEl}
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2 empty:hidden">
              {a.isImmediateEntrance === true && <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold text-foreground"><CalendarDays className="h-3.5 w-3.5 text-primary" />כניסה מיידית</span>}
            </div>
            {oneLiner && <p className="break-words text-muted-foreground">{oneLiner}</p>}
          </div>
        </div>
      </header>

      <div className="grid min-w-0 gap-5 [@container(min-width:900px)]:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
      <div className="min-w-0 space-y-5">
      {(specs.length > 0 || rooms || total || floor) && (
        <section>
          <h3 className="mb-2 text-xs font-bold text-muted-foreground">נתוני הנכס</h3>
        {(rooms || total || floor) && (
          <div className="mb-3 flex flex-wrap gap-2">
            {rooms && <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 font-semibold text-foreground"><DoorOpen className="h-4 w-4 text-primary" />{rooms} חדרים</span>}
            {total && <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 font-semibold text-foreground"><Maximize2 className="h-4 w-4 text-primary" />{total} מ״ר</span>}
            {floor && <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 font-semibold text-foreground"><Layers className="h-4 w-4 text-primary" />קומה {floor}</span>}
          </div>
        )}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,150px),1fr))] gap-2">
            {specs.map((s) => (
              <div key={s.label} className="flex min-w-0 items-center gap-2.5 rounded-lg border bg-background p-2.5">
                <s.icon className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  <p className="break-words font-semibold text-foreground">{s.value}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(amenities.length > 0 || tags.length > 0) && (
        <section>
          <h3 className="mb-2 text-xs font-bold text-muted-foreground">מאפיינים</h3>
          <div className="flex flex-wrap gap-1.5">
            {amenities.map((am) => (
              <span key={am.label} className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs text-foreground"><am.icon className="h-3.5 w-3.5 text-primary" />{am.label}</span>
            ))}
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-success" />{t}</span>
            ))}
          </div>
        </section>
      )}

      {description && (
        <section>
          <h3 className="mb-1.5 text-xs font-bold text-muted-foreground">תיאור</h3>
          <p className="whitespace-pre-line break-words leading-relaxed text-foreground">{description}</p>
        </section>
      )}

      {perkSections.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-bold text-muted-foreground">הסביבה</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {perkSections.map((sec) => (
              <div key={sec.title} className="min-w-0 rounded-lg border bg-background p-3">
                <p className="mb-2 flex items-center gap-1.5 font-semibold text-foreground"><sec.icon className="h-4 w-4 text-primary" />{sec.title}</p>
                <ul className="space-y-1.5">
                  {sec.items.map((p) => { const Icon = perkIcon(p); return (
                    <li key={p} className="flex items-start gap-1.5 break-words text-foreground"><Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />{p}</li>
                  ); })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      </div>
      <aside className="min-w-0 space-y-5 [@container(min-width:900px)]:sticky [@container(min-width:900px)]:top-4 [@container(min-width:900px)]:self-start">
      {mapQuery && (
        <section>
          <h3 className="mb-2 text-xs font-bold text-muted-foreground">מיקום</h3>
          <div className="overflow-hidden rounded-xl border">
            <iframe title="מפת הנכס" src={embedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="block h-56 w-full border-0" />
            <div className="grid grid-cols-2 gap-px bg-border">
              <a href={wazeUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center justify-center gap-2 bg-card py-2.5 font-semibold text-foreground transition-colors hover:bg-muted">
                <Navigation className="h-4 w-4 text-primary" />ניווט בוויז
              </a>
              <a href={gmapsUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center justify-center gap-2 bg-card py-2.5 font-semibold text-foreground transition-colors hover:bg-muted">
                <MapPin className="h-4 w-4 text-success" />גוגל מפות
              </a>
            </div>
          </div>
        </section>
      )}

      </aside>
      </div>
    </div>
  );
}
