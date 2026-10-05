import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  Accessibility, Armchair, Award, BadgeCheck, Banknote, Bath, Building, Building2, Bus, CalendarDays, Car, CarFront,
  CheckCircle2, Compass, DoorOpen, Dog, Fence, Flame, GraduationCap, Home, Layers, Loader2, MapPin, Maximize2,
  Navigation, Package, Receipt, Ruler, School, ShieldCheck, Snowflake, Sparkles, Store, Trees, Utensils, Wallet, Wrench,
} from 'lucide-react';
import { normalizeListing, formatPrice } from '@/pages/PublicListingPage';

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

export default function ExpandedPropertyDetails({ idOrSlug }: { idOrSlug: string }) {
  const { data, isLoading } = useQuery({
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

  if (isLoading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!data) return null;
  const { listing, raw } = data;
  const a: Raw = { ...asObj(raw.additional_details), ...asObj(raw.attributes) };

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
    a.isImmediateEntrance === true && dateHe(a.entranceDate) ? null : null,
    parkingCount && { icon: Car, label: 'מקומות חניה', value: String(parkingCount) },
    a.includeParking !== undefined && { icon: CarFront, label: 'חניה כלולה', value: a.includeParking ? 'כן' : 'לא' },
    num(a.balconiesCount) && { icon: DoorOpen, label: 'מרפסות', value: String(num(a.balconiesCount)) },
    arnona && { icon: Receipt, label: 'ארנונה', value: `${ils(arnona)} לחודשיים` },
    vaad && { icon: Wallet, label: 'ועד בית', value: `${ils(vaad)} לחודש` },
    payments && { icon: Banknote, label: 'תשלומים', value: String(payments) },
    hebrew(a.propertyCondition) && { icon: BadgeCheck, label: 'מצב הנכס', value: hebrew(a.propertyCondition) },
    num(a.shelterDistance) && { icon: ShieldCheck, label: 'מרחק למקלט', value: `${num(a.shelterDistance)} מ׳` },
  ].filter((s) => s && (s as Spec).value) as Spec[]);

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

  const description = hebrew(a.description) && hebrew(a.description).length > listing.description.length ? hebrew(a.description) : listing.description;
  const hasCoords = listing.latitude !== null && listing.longitude !== null;
  const mapQuery = hasCoords ? `${listing.latitude},${listing.longitude}` : listing.addressForMap;
  const wazeUrl = hasCoords
    ? `https://waze.com/ul?ll=${listing.latitude},${listing.longitude}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(mapQuery)}&navigate=yes`;
  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapQuery)}`;
  const embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&hl=iw&z=16&output=embed`;

  const office = listing.officeName && !listing.officeName.includes('לא צוין') ? listing.officeName : '';
  const agent = listing.brokerName && !listing.brokerName.includes('לא צוין') ? listing.brokerName : '';

  return (
    <div dir="rtl" className="min-w-0 max-w-full space-y-5 text-sm">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-base font-bold text-foreground">{listing.title}</p>
          {oneLiner && <p className="mt-0.5 break-words text-muted-foreground">{oneLiner}</p>}
        </div>
        <p className="shrink-0 text-lg font-bold text-primary">{formatPrice(listing.price, listing.dealType)}</p>
      </div>

      {specs.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-bold text-muted-foreground">נתוני הנכס</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {specs.map((s) => (
              <div key={s.label} className="flex min-w-0 items-center gap-2.5 rounded-lg border bg-background p-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><s.icon className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  <p className="truncate font-semibold text-foreground">{s.value}</p>
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

      {mapQuery && (
        <section>
          <h3 className="mb-2 text-xs font-bold text-muted-foreground">מיקום</h3>
          <div className="overflow-hidden rounded-xl border">
            <iframe title="מפת הנכס" src={embedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="block h-56 w-full border-0" />
            <div className="grid grid-cols-2 gap-px bg-border">
              <a href={wazeUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center justify-center gap-2 bg-card py-2.5 font-semibold text-foreground transition-colors hover:bg-muted">
                <Navigation className="h-4 w-4 text-primary" />ניווט ב-Waze
              </a>
              <a href={gmapsUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center justify-center gap-2 bg-card py-2.5 font-semibold text-foreground transition-colors hover:bg-muted">
                <MapPin className="h-4 w-4 text-success" />Google Maps
              </a>
            </div>
          </div>
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

      {(office || agent) && (
        <footer className="flex min-w-0 items-center gap-3 rounded-xl border bg-muted/40 p-3">
          {listing.agencyLogoUrl
            ? <img src={listing.agencyLogoUrl} alt={office || 'משרד'} className="h-10 w-10 shrink-0 rounded-md bg-background object-contain" />
            : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></span>}
          <div className="min-w-0">
            {office && <p className="truncate font-semibold text-foreground">{office}</p>}
            <p className="truncate text-xs text-muted-foreground">
              {[agent, listing.brokerLicenceNumber ? `רישיון תיווך ${listing.brokerLicenceNumber}` : ''].filter(Boolean).join(' · ')}
            </p>
          </div>
          {listing.brokerLicenceNumber && <BadgeCheck className="ms-auto h-5 w-5 shrink-0 text-primary" aria-label="מתווך מורשה" />}
        </footer>
      )}
    </div>
  );
}
