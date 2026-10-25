/**
 * PublicListingPage
 * -----------------
 * Public, auth-free property page used by affiliate marketing links
 * (`/p/:slug?ref=CODE`). The slug may be a listings.slug OR a listings.id.
 *
 * Hardening rules (affiliate links used to blank-screen here):
 *  - Referral parsing / storage never throws and never blocks rendering.
 *  - Every listing field is treated as possibly null / wrong-shaped.
 *  - The whole tree is wrapped in an ErrorBoundary so a render failure
 *    degrades to a friendly card instead of a white page.
 */
import { useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fmtILS } from '@/lib/formatCurrency';
import { attributeCards } from '@/components/public/propertyAttributes';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bed, Building2, ChevronLeft, ChevronRight, Heart, ImageIcon, Layers, Loader2, Ruler, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ErrorBoundary from '@/components/ErrorBoundary';
import WhatsAppIcon from '@/components/properties/WhatsAppIcon';
import { officialWaLink } from '@/lib/officialWa';
import { captureRefFromLocation, getStoredRefCode } from '@/lib/referralAttribution';
import { toast } from 'sonner';
import { publicUrl } from '@/lib/publicUrl';
import BrokerAttribution from '@/components/properties/BrokerAttribution';
import WorkspacePropertiesMap from '@/components/properties/WorkspacePropertiesMap';
import { addressMapQuery, fullPropertyAddress, streetLine } from '@/lib/fullAddress';
import PropertyContactActions, { type ContactOptions } from '@/components/public/PropertyContactActions';
import { OwnerListingActions } from '@/components/properties/PropertyRowActions';
import { ritaPropertyPremsg } from '@/lib/ritaPremsg';
import { useAuth } from '@/hooks/useAuth';
import { publicAdDescription, publicAdTitle } from '@/lib/publicAdPresentation';
import PublicAdHeading from '@/components/public/PublicAdHeading';
import PropertyCommissionIcons from '@/components/public/PropertyCommissionIcons';

export type PublicListing = {
  id: string | null;
  slug: string | null;
  title: string;
  location: string;
  city: string;
  dealType: 'sale' | 'rent' | null;
  price: number;
  rooms: number;
  sqm: number;
  floor: number | null;
  description: string;
  photos: string[];
  brokerName: string;
  officeName: string;
  brokerLicenceNumber: string | null;
  agencyLogoUrl: string | null;
  publisherKind?: string | null;
  details: Array<{ label: string; value: string }>;
  /** Yad2-style translated attribute cards (icon + Hebrew label + value). */
  attributes: Array<{ icon: LucideIcon; label: string; value: string }>;
  /** Rich data grouped into readable blocks (features, environment, source…). */
  groups: Array<{ title: string; rows: Array<{ label: string; value: string }> }>;
  latitude: number | null;
  longitude: number | null;
  addressForMap: string;
  /** Canonical WhatsApp click-to-chat opener for this exact property. */
  premsg: string;
  contactOptions: ContactOptions;
};

const DETAIL_LABELS: Record<string, string> = {
  neighborhood: 'שכונה', available_from: 'כניסה', project_name: 'פרויקט', elevator: 'מעלית', parking: 'חניה',
};

const GROUP_LABELS: Record<string, string> = {
  property_type: 'סוג נכס', listing_type: 'סוג עסקה', condition: 'מצב הנכס',
  total_floors: 'קומות בבניין', year_built: 'שנת בנייה', balcony: 'מרפסת',
  safe_room: 'ממ״ד', storage: 'מחסן', air_conditioning: 'מיזוג', accessible: 'גישה לנכים',
  renovated: 'משופץ', furnished: 'מרוהט', bars: 'סורגים', parking: 'חניה', elevator: 'מעלית',
  entry_date: 'תאריך כניסה', garden: 'גינה', yard: 'חצר', pool: 'בריכה', solar_heater: 'דוד שמש',
  boiler: 'דוד חשמל', kosher_kitchen: 'מטבח כשר', pets: 'חיות מחמד', pets_allowed: 'מותר בעלי חיים',
  roommates: 'שותפים', long_term: 'לטווח ארוך', parking_spots: 'מקומות חניה', warehouse: 'מחסן',
  shelter: 'מקלט', mamad: 'ממ״ד', exposure: 'כיווני אוויר', view: 'נוף', arnona: 'ארנונה',
  vaad_bayit: 'ועד בית', house_committee: 'ועד בית', property_tax: 'ארנונה', garden_sqm: 'שטח גינה',
  balcony_sqm: 'שטח מרפסת', built_sqm: 'שטח בנוי', lot_sqm: 'שטח מגרש', bathrooms: 'חדרי רחצה',
  toilets: 'שירותים', bedrooms: 'חדרי שינה', heating: 'חימום', schools: 'בתי ספר', transport: 'תחבורה',
  parks: 'פארקים', shopping: 'קניות', notes: 'הערות', name: 'שם', type: 'סוג', distance: 'מרחק', price: 'מחיר', date: 'תאריך', rooms: 'חדרים', sqm: 'מ״ר', floor: 'קומה',
};

const VALUE_LABELS: Record<string, string> = {
  sale: 'מכירה', rent: 'השכרה', apartment: 'דירה', house: 'בית פרטי', cottage: 'קוטג׳',
  penthouse: 'פנטהאוז', duplex: 'דופלקס', studio: 'סטודיו', commercial: 'מסחרי', land: 'מגרש',
  new: 'חדש', renovated: 'משופץ', good: 'שמור', needs_renovation: 'דורש שיפוץ', true: 'כן', false: 'לא',
};

const HIDDEN_PUBLIC_KEYS = new Set(['office_notes', 'internal_notes', 'owner_phone', 'owner_name', 'owner_email', 'id', 'url', 'sources', 'source', 'source_url', 'external_id', 'removed_photo_keys', 'media_vision_checked', 'media_vision_at', 'metadata_backfilled_at', 'fetched_at', 'created_at', 'updated_at', 'publisher_type', 'contact_whatsapp', 'contact_name', 'contact_email', 'contact_phone', 'lead_daily_limits', 'commission_terms_accepted_at', 'media_videos', 'media_photos', 'workspace_owner_id', 'user_id', 'slug', 'textEng', 'one_liner_he', 'perks']);

function cleanDate(value: unknown): string | null {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

/** Turns any value (including nested JSON) into short readable Hebrew text. */
function readable(value: unknown): string {
  if (value === null || value === undefined || value === '' || value === false) return '';
  if (typeof value === 'boolean') return 'כן';
  if (Array.isArray(value)) return value.map(readable).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const text = readable(item);
        const keyLabel = GROUP_LABELS[key];
        if (HIDDEN_PUBLIC_KEYS.has(key)) return '';
        return text ? (keyLabel || /[\u0590-\u05FF]/.test(key) ? `${keyLabel ?? key}: ${text}` : text) : '';
      })
      .filter(Boolean)
      .join(' · ');
  }
  const date = cleanDate(value);
  if (date) return date;
  const raw = String(value).trim();
  return VALUE_LABELS[raw.toLowerCase()] ?? raw;
}

function detailRows(row: any): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  for (const key of ['available_from', 'project_name', 'elevator', 'parking']) {
    const text = readable(row?.[key]);
    if (text) rows.push({ label: DETAIL_LABELS[key], value: text });
  }
  return rows;
}

/** Every remaining rich block from the DB / original ad, kept human-readable. */
function detailGroups(row: any): Array<{ title: string; rows: Array<{ label: string; value: string }> }> {
  const sources: Array<[string, unknown]> = [
    ['פרטי דירת הפרויקט', row?.features?.developer_unit_details],
    ['מפרט הפרויקט', row?.features?.specifications ? { specifications: row.features.specifications } : null],
    ['הסביבה', row?.area_perks],
    ['היסטוריית מחיר', row?.price_history],
  ];
  const groups: Array<{ title: string; rows: Array<{ label: string; value: string }> }> = [];
  for (const [title, value] of sources) {
    if (!value || typeof value !== 'object') continue;
    const rows: Array<{ label: string; value: string }> = [];
    const entries = Array.isArray(value)
      ? (value as unknown[]).map((item, index) => [String(index + 1), item] as [string, unknown])
      : Object.entries(value as Record<string, unknown>);
    for (const [key, item] of entries) {
      if (HIDDEN_PUBLIC_KEYS.has(key)) continue;
      const text = readable(item);
      // Keep every detail from the property record: unknown keys get a tidy label.
      const label = GROUP_LABELS[key] ?? (/^\d+$/.test(key) ? '' : key.replace(/_/g, ' '));
      if (text) rows.push({ label, value: text });
    }
    if (rows.length) groups.push({ title, rows });
  }
  return groups;
}


function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function collectPhotos(row: any): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && /^https?:\/\//i.test(v) && !out.includes(v)) out.push(v);
  };
  try {
    push(row?.image_url);
    const raw = row?.media_photos;
    const arr = Array.isArray(raw) ? raw : typeof raw === 'string' ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (typeof item === 'string') push(item);
        else push(item?.url ?? item?.src ?? item?.public_url);
      }
    }
  } catch {
    /* malformed media payload — ignore */
  }
  return out;
}

/** Never throws: turns any DB row shape into safe display values. */
export function normalizeListing(row: any, attribution?: any): PublicListing {
  const city = typeof row?.city === 'string' ? row.city : '';
  // Complete address: street + house number + apartment, neighborhood, city.
  const address = streetLine(row ?? {});
  const location = fullPropertyAddress(row ?? {});
  const sourceTitle = typeof row?.property_title === 'string' ? row.property_title.trim() : '';
  const title = publicAdTitle(row ?? {});
  const dealType = row?.deal_type === 'rent' ? 'rent' : row?.deal_type === 'sale' ? 'sale' : null;
  const floorRaw = Number(row?.floor);
  return {
    id: typeof row?.id === 'string' ? row.id : null,
    slug: typeof row?.slug === 'string' ? row.slug : null,
    title,
    location,
    city,
    dealType,
    price: toNumber(row?.asking_price),
    rooms: toNumber(row?.rooms),
    sqm: toNumber(row?.sqm),
    floor: Number.isFinite(floorRaw) ? floorRaw : null,
    description: publicAdDescription(
       (typeof row?.long_description === 'string' && row.long_description.trim()) ||
       (typeof row?.short_description === 'string' && row.short_description.trim()) ||
      (typeof row?.description === 'string' && row.description.trim()) ||
      '', sourceTitle),
    photos: collectPhotos(row),
    brokerName: typeof attribution?.broker_name === 'string' ? attribution.broker_name : 'שם המתווך לא צוין',
    officeName: typeof attribution?.office_name === 'string' ? attribution.office_name : 'שם המשרד לא צוין',
    brokerLicenceNumber: typeof attribution?.broker_license_number === 'string' ? attribution.broker_license_number : null,
    agencyLogoUrl: typeof attribution?.agency_logo_url === 'string' ? attribution.agency_logo_url : null,
    publisherKind: typeof attribution?.publisher_kind === 'string' ? attribution.publisher_kind : null,
    details: detailRows(row),
    attributes: attributeCards(row ?? {}),
    groups: detailGroups(row),
    latitude: Number.isFinite(Number(row?.latitude)) && Number(row?.latitude) !== 0 ? Number(row.latitude) : null,
    longitude: Number.isFinite(Number(row?.longitude)) && Number(row?.longitude) !== 0 ? Number(row.longitude) : null,
    addressForMap: addressMapQuery(row ?? {}),
    premsg: ritaPropertyPremsg(row ?? {}),
    contactOptions: row?.contact_options && typeof row.contact_options === 'object' ? row.contact_options : null,
  };
}

export function formatPrice(value: number, dealType: PublicListing['dealType']): string {
  if (!value) return 'לפרטים';
  const amount = fmtILS(value);
  return amount;
}

function PublicListingContent() {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const closeDetails = () => {
    const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
    if (returnTo) { navigate(returnTo); return; }
    if (typeof window.history.state?.idx === 'number' && window.history.state.idx > 0) navigate(-1);
    else navigate('/public-listings', { replace: true });
  };
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('ref');
    if (!code || !/^[a-z0-9]{6,32}$/i.test(code)) return;
    const key = `realtyz:aff-click:${code}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    void (supabase as any).rpc('track_affiliate_click', { _code: code });
  }, []);
  const slug = typeof params.slug === 'string' ? params.slug : '';
  useEffect(() => {
    if (!slug) return;
    const key = `realtyz:listing-view:${slug}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    void supabase.rpc('track_listing_referral_view', { _id_or_slug: slug, _code: new URLSearchParams(window.location.search).get('ref') });
  }, [slug]);
  const [refCode, setRefCode] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Referral capture must never break rendering.
  useEffect(() => {
    try {
      setRefCode(captureRefFromLocation() ?? getStoredRefCode());
    } catch {
      setRefCode(null);
    }
  }, []);

  const { data: payload, isLoading, isError } = useQuery({
    queryKey: ['public-listing', slug],
    enabled: !!slug,
    retry: 1,
    queryFn: async (): Promise<{ property: PublicListing; properties: PublicListing[]; projectUnits: (PublicListing & { buildingName: string })[] } | null> => {
      const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-listing-view?id=${encodeURIComponent(slug)}`;
      const response = await fetch(endpoint, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`public listing failed: ${response.status}`);
      const payload = await response.json();
      if (!payload?.property) return null;
      const workspaceProperties = Array.isArray(payload.workspace_properties) ? payload.workspace_properties : [];
      return {
        property: normalizeListing(payload.property, payload.property?.attribution ?? payload.attribution),
        projectUnits: (Array.isArray(payload.project_units) ? payload.project_units : []).map((row: any) => ({ ...normalizeListing(row, row.attribution), buildingName: row.building_name || 'דירות הפרויקט' })),
        properties: [payload.property, ...workspaceProperties]
          .map((row: any) => normalizeListing(row, row?.attribution ?? payload.attribution)),
      };
    },
  });
  const data = payload?.properties.find((property) => property.id === selectedId) ?? payload?.property ?? null;
  const { data: favorite = false, refetch: refetchFavorite } = useQuery({
    queryKey: ['public-listing-favorite', user?.id, data?.id],
    enabled: !!user?.id && !!data?.id,
    queryFn: async () => {
      if (!user?.id || !data?.id) return false;
      const { data: saved, error } = await supabase.from('listing_favorites').select('listing_id').eq('user_id', user.id).eq('listing_id', data.id).maybeSingle();
      if (error) throw error;
      return !!saved;
    },
  });
  const toggleFavorite = async () => {
    if (!data?.id || favoriteBusy) return;
    if (!user?.id) { navigate('/auth', { state: { returnTo: window.location.pathname + window.location.search } }); return; }
    setFavoriteBusy(true);
    try {
      const { error } = favorite
        ? await supabase.from('listing_favorites').delete().eq('user_id', user.id).eq('listing_id', data.id)
        : await supabase.from('listing_favorites').insert({ user_id: user.id, listing_id: data.id });
      if (error) throw error;
      await refetchFavorite();
      toast.success(favorite ? 'הנכס הוסר מהמועדפים' : 'הנכס נשמר במועדפים');
    } catch { toast.error('שמירת המועדף נכשלה, נסו שוב'); }
    finally { setFavoriteBusy(false); }
  };


  const shareUrl = useMemo(() => {
    try {
      const path = `/p/${data?.slug || data?.id || slug}`;
      return publicUrl(refCode ? `${path}?ref=${refCode}` : path);
    } catch {
      return typeof window !== 'undefined' ? window.location.href : '';
    }
  }, [data?.slug, data?.id, slug, refCode]);

  useEffect(() => {
    if (!data) return;
    try {
      document.title = `${data.title} | TORAFF`;
      const description = (data.description || data.location || data.title).slice(0, 155);
      const setMeta = (key: string, content: string) => {
        let tag = document.querySelector(`meta[property="${key}"], meta[name="${key}"]`) as HTMLMetaElement | null;
        if (!tag) {
          tag = document.createElement('meta');
          tag.setAttribute(key.startsWith('og:') ? 'property' : 'name', key);
          document.head.appendChild(tag);
        }
        tag.content = content;
      };
      setMeta('description', description);
      setMeta('og:title', `${data.title} | TORAFF`);
      setMeta('og:description', description);
      setMeta('og:url', shareUrl);
      setMeta('og:type', 'website');
    } catch {
      /* metadata is best-effort */
    }
  }, [data, shareUrl]);

  useEffect(() => {
    if (payload?.property.id) setSelectedId(payload.property.id);
  }, [payload?.property.id]);

  useEffect(() => {
    setSlide(0);
  }, [selectedId]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary" dir="rtl">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary px-5" dir="rtl">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>הנכס אינו זמין</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>הנכס הוסר מהפרסום או שהקישור אינו תקין.</p>
            <Button variant="ghost" onClick={closeDetails}><X className="h-4 w-4" />סגירה וחזרה</Button>
            <Button asChild variant="outline">
              <a href={officialWaLink('שלום, אשמח לעזרה במצוא נכס')} target="_blank" rel="noopener noreferrer">
                <WhatsAppIcon className="h-4 w-4" /> דברו איתנו בוואטסאפ
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const specs = [
    data.rooms ? { label: 'חדרים', value: String(data.rooms), icon: Bed } : null,
    data.sqm ? { label: 'מ״ר', value: String(data.sqm), icon: Ruler } : null,
    data.floor !== null ? { label: 'קומה', value: String(data.floor), icon: Layers } : null,
    data.city ? { label: 'עיר', value: data.city, icon: Building2 } : null,
  ].filter(Boolean) as { label: string; value: string; icon: typeof Bed }[];

  const cover = data.photos[Math.min(slide, Math.max(0, data.photos.length - 1))];

  // Map + navigation: coordinates when we have them, otherwise the address.
  const mapProperties = (payload?.properties ?? []).flatMap((property, index) => {
    if (property.latitude === null || property.longitude === null) return [];
    const id = property.id ?? property.slug ?? `public-property-${index}`;
    return [{ id, title: property.location || property.title, latitude: property.latitude, longitude: property.longitude, price: property.price, dealType: property.dealType, rooms: property.rooms, imageUrl: property.photos[0] }];
  });
  const selectedMapId = data.id ?? data.slug ?? mapProperties[0]?.id ?? null;

  return (
    <div className="min-h-screen bg-secondary pb-12" dir="rtl">
      <div className="mx-auto max-w-4xl space-y-5 px-4 pt-5">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 pt-3">
            <Button variant="ghost" size="sm" onClick={closeDetails} aria-label="סגירה וחזרה לעמוד הקודם"><X className="h-4 w-4" />סגירה וחזרה</Button>
            <div className="flex items-center gap-2">

              {data.id && <OwnerListingActions listingId={data.id} />}
            </div>
          </div>
          <div className="px-4 py-3">
            <PublicAdHeading title={data.title} price={formatPrice(data.price, data.dealType)} dealType={data.dealType} />
          </div>
          <div data-property-image-toolbar className="flex min-h-10 flex-wrap items-center gap-1 px-3">
            {data.photos.length > 1 && <><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="תמונה קודמת" onClick={() => setSlide((slide + data.photos.length - 1) % data.photos.length)}><ChevronRight className="h-4 w-4" /></Button><span className="text-xs tabular-nums">{slide + 1}/{data.photos.length}</span><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="תמונה הבאה" onClick={() => setSlide((slide + 1) % data.photos.length)}><ChevronLeft className="h-4 w-4" /></Button></>}
            <div className="ms-auto flex items-center gap-1"><Button variant="ghost" size="icon" onClick={() => void toggleFavorite()} disabled={favoriteBusy} aria-label={favorite ? 'הסרה מהמועדפים' : 'שמירה במועדפים'} aria-pressed={favorite} title={favorite ? 'הסרה מהמועדפים' : 'שמירה במועדפים'}><Heart className={`h-5 w-5 text-destructive ${favorite ? 'fill-current' : ''}`} /></Button></div>
          </div>
          <div className="relative mt-3 aspect-[16/10] w-full bg-muted">
            {cover ? (
              <img src={cover} alt={data.title} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImageIcon className="h-10 w-10" />
              </div>
            )}

          </div>

          {data.photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto p-3">
              {data.photos.map((url, i) => (
                <Button
                  key={url}
                  type="button"
                  variant="ghost"
                  aria-label={`תמונה ${i + 1}`}
                  aria-pressed={i === slide}
                  onClick={() => setSlide(i)}
                  className={`h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 p-0 ${
                    i === slide ? 'border-primary' : 'border-transparent opacity-70'
                  }`}
                >
                  <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                </Button>
              ))}
            </div>
          )}

          <CardContent className="space-y-4 pt-4 text-right">
            {specs.length > 0 && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {specs.map((spec) => (
                  <div key={spec.label} className="rounded-lg border bg-background/70 p-3 text-center">
                    <spec.icon className="mx-auto mb-1 h-4 w-4 text-primary" />
                    <div className="text-base font-bold">{spec.value}</div>
                    <div className="text-xs text-muted-foreground">{spec.label}</div>
                  </div>
                ))}
              </div>
            )}

            {data.description && (
              <p className="whitespace-pre-line text-base leading-7 text-foreground">{data.description}</p>
            )}
            {!!payload?.projectUnits.length && <section className="space-y-5 border-t pt-4" aria-label="דירות הפרויקט"><h2 className="text-lg font-bold">דירות הפרויקט · {payload.projectUnits.length}</h2>{[...new Set(payload.projectUnits.map(unit => unit.buildingName))].map(building => <div key={building} className="space-y-3"><h3 className="font-semibold">{building}</h3><div className="grid gap-3 sm:grid-cols-2">{payload.projectUnits.filter(unit => unit.buildingName === building).map(unit => <article key={unit.id} className="min-w-0 space-y-2 rounded-lg border border-border p-3">{unit.photos[0] && <img src={unit.photos[0]} alt={unit.title} loading="lazy" className="aspect-[4/3] w-full rounded-md object-cover" />}<PublicAdHeading compact title={unit.title} price={formatPrice(unit.price, unit.dealType)} dealType={unit.dealType} /><p className="text-sm text-muted-foreground">{unit.location}</p><p className="text-sm">{[unit.rooms ? `${unit.rooms} חדרים` : '', unit.sqm ? `${unit.sqm} מ״ר` : '', unit.floor !== null ? `קומה ${unit.floor}` : ''].filter(Boolean).join(' · ')}</p>{unit.id && <PropertyCommissionIcons listingId={unit.id} />}<Button asChild variant="outline" className="w-full"><a href={`/p/${encodeURIComponent(unit.slug || unit.id || '')}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ''}`}>כל פרטי הדירה</a></Button></article>)}</div></div>)}</section>}

            {data.attributes.length > 0 && (
              <div className="border-t pt-4">
                <h2 className="mb-2 text-sm font-bold text-foreground">נתוני הנכס</h2>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,150px),1fr))] gap-2">
                  {data.attributes.map((card) => (
                    <div key={card.label} className="flex min-w-0 items-center gap-2.5 rounded-lg border bg-background/70 p-2.5" dir="rtl">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center text-primary"><card.icon className="h-[21px] w-[21px]" /></span>
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">{card.label}</p>
                        <p className="break-words text-sm font-semibold text-foreground">{card.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.groups.map((group) => (
              <div key={group.title} className="border-t pt-4">
                <h2 className="mb-2 text-sm font-bold text-foreground">{group.title}</h2>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                  {group.rows.map((row, index) => (
                    <div key={`${group.title}-${row.label}-${index}`} className="min-w-0">
                      <dt className="text-xs font-semibold text-muted-foreground">{row.label}</dt>
                      <dd className="mt-0.5 break-words text-sm text-foreground">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}

            {(data.latitude !== null && data.longitude !== null) || data.addressForMap ? (
              <div className="space-y-2 border-t pt-4">
                <WorkspacePropertiesMap properties={mapProperties} selectedId={selectedMapId} onSelect={setSelectedId} fallbackAddress={data.addressForMap} addressLabel={data.location} />
              </div>
            ) : null}

            {/* Share lives inside the contact row below, next to WhatsApp / call / form. */}
            {data.id && <PropertyContactActions listingId={data.id} title={data.title} dealType={data.dealType} premsg={data.premsg} options={data.contactOptions} compact formAsButton singleRow shareUrl={shareUrl} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function PublicListingPage() {
  return (
    <ErrorBoundary source="PublicListingPage">
      <PublicListingContent />
    </ErrorBoundary>
  );
}
