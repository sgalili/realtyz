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
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bed, Building2, ImageIcon, Layers, Loader2, MapPin, Ruler, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import ErrorBoundary from '@/components/ErrorBoundary';
import WhatsAppIcon from '@/components/properties/WhatsAppIcon';
import { officialWaLink } from '@/lib/officialWa';
import { captureRefFromLocation, getStoredRefCode } from '@/lib/referralAttribution';
import { toast } from 'sonner';
import { publicUrl } from '@/lib/publicUrl';
import BrokerAttribution from '@/components/properties/BrokerAttribution';

type PublicListing = {
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
  details: Array<{ label: string; value: string }>;
  /** Rich data grouped into readable blocks (features, environment, source…). */
  groups: Array<{ title: string; rows: Array<{ label: string; value: string }> }>;
  latitude: number | null;
  longitude: number | null;
  addressForMap: string;
};

const DETAIL_LABELS: Record<string, string> = {
  neighborhood: 'שכונה', available_from: 'כניסה', project_name: 'פרויקט', elevator: 'מעלית', parking: 'חניה',
  source: 'מקור', external_id: 'מזהה במקור', status: 'סטטוס שמור',
  created_at: 'נוסף למאגר', updated_at: 'עודכן לאחרונה',
};

/** Turns any value (including nested JSON) into short readable Hebrew text. */
function readable(value: unknown): string {
  if (value === null || value === undefined || value === '' || value === false) return '';
  if (typeof value === 'boolean') return 'כן';
  if (Array.isArray(value)) return value.map(readable).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const text = readable(item);
        return text ? `${key}: ${text}` : '';
      })
      .filter(Boolean)
      .join(' · ');
  }
  return String(value).trim();
}

function detailRows(row: any): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  for (const key of ['neighborhood', 'available_from', 'project_name', 'elevator', 'parking', 'source', 'external_id', 'status', 'created_at', 'updated_at']) {
    const text = readable(row?.[key]);
    if (text) rows.push({ label: DETAIL_LABELS[key], value: text });
  }
  return rows;
}

/** Every remaining rich block from the DB / original ad, kept human-readable. */
function detailGroups(row: any): Array<{ title: string; rows: Array<{ label: string; value: string }> }> {
  const sources: Array<[string, unknown]> = [
    ['מאפיינים', row?.features],
    ['נתוני הנכס', row?.attributes],
    ['פרטים נוספים', row?.additional_details],
    ['ריהוט', row?.furniture_details],
    ['הסביבה', row?.area_perks],
    ['פרטי המודעה במקור', row?.source_metadata],
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
      const text = readable(item);
      if (text) rows.push({ label: key, value: text });
    }
    if (rows.length) groups.push({ title, rows });
  }
  return groups;
}

/** Public pages must never expose house / apartment numbers. */
function publicAddress(raw?: string | null): string {
  if (!raw) return '';
  try {
    return String(raw)
      .replace(/\b(דירה|דירת|כניסה|קומה|בית|מספר)\s*\d+[א-ת]?\b/g, '')
      .replace(/[,/]\s*\d+[א-ת]?\s*$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  } catch {
    return '';
  }
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
function normalizeListing(row: any, attribution?: any): PublicListing {
  const address = publicAddress(row?.address);
  const city = typeof row?.city === 'string' ? row.city : '';
  const location = [address, row?.neighborhood, city].filter((v) => typeof v === 'string' && v.trim()).join(' · ');
  const title =
    (typeof row?.property_title === 'string' && row.property_title.trim()) ||
    address ||
    city ||
    'נכס';
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
    description:
       (typeof row?.long_description === 'string' && row.long_description.trim()) ||
       (typeof row?.short_description === 'string' && row.short_description.trim()) ||
      (typeof row?.description === 'string' && row.description.trim()) ||
      '',
    photos: collectPhotos(row),
    brokerName: typeof attribution?.broker_name === 'string' ? attribution.broker_name : 'שם המתווך לא צוין',
    officeName: typeof attribution?.office_name === 'string' ? attribution.office_name : 'שם המשרד לא צוין',
    brokerLicenceNumber: typeof attribution?.broker_license_number === 'string' ? attribution.broker_license_number : null,
    agencyLogoUrl: typeof attribution?.agency_logo_url === 'string' ? attribution.agency_logo_url : null,
    details: detailRows(row),
    groups: detailGroups(row),
    latitude: Number.isFinite(Number(row?.latitude)) && Number(row?.latitude) !== 0 ? Number(row.latitude) : null,
    longitude: Number.isFinite(Number(row?.longitude)) && Number(row?.longitude) !== 0 ? Number(row.longitude) : null,
    addressForMap: [address, city].filter(Boolean).join(', '),
  };
}

function formatPrice(value: number, dealType: PublicListing['dealType']): string {
  if (!value) return 'לפרטים';
  const amount = `₪${value.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;
  return dealType === 'rent' ? `${amount} לחודש` : amount;
}

function PublicListingContent() {
  const params = useParams();
  const slug = typeof params.slug === 'string' ? params.slug : '';
  const [refCode, setRefCode] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);

  // Referral capture must never break rendering.
  useEffect(() => {
    try {
      setRefCode(captureRefFromLocation() ?? getStoredRefCode());
    } catch {
      setRefCode(null);
    }
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-listing', slug],
    enabled: !!slug,
    retry: 1,
    queryFn: async (): Promise<PublicListing | null> => {
      const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-listing-view?id=${encodeURIComponent(slug)}`;
      const response = await fetch(endpoint, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`public listing failed: ${response.status}`);
      const payload = await response.json();
      return payload?.property ? normalizeListing(payload.property, payload.attribution) : null;
    },
  });

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
      document.title = `${data.title} | Realtyz`;
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
      setMeta('og:title', `${data.title} | Realtyz`);
      setMeta('og:description', description);
      setMeta('og:url', shareUrl);
      setMeta('og:type', 'website');
    } catch {
      /* metadata is best-effort */
    }
  }, [data, shareUrl]);

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: data?.title ?? 'נכס', url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      toast.success('הקישור הועתק');
    } catch {
      /* user cancelled or clipboard blocked */
    }
  };

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

  const waText = `שלום, מתעניין/ת בנכס: ${data.title}${data.location ? ` (${data.location})` : ''}${
    refCode ? ` [ref:${refCode}]` : ''
  }`;
  const cover = data.photos[Math.min(slide, Math.max(0, data.photos.length - 1))];

  // Map + navigation: coordinates when we have them, otherwise the address.
  const hasCoords = data.latitude !== null && data.longitude !== null;
  const mapQuery = hasCoords ? `${data.latitude},${data.longitude}` : data.addressForMap;
  const mapEmbed = hasCoords
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${(data.longitude as number) - 0.006}%2C${(data.latitude as number) - 0.004}%2C${(data.longitude as number) + 0.006}%2C${(data.latitude as number) + 0.004}&layer=mapnik&marker=${data.latitude}%2C${data.longitude}`
    : '';
  const googleUrl = mapQuery ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapQuery)}` : '';
  const wazeUrl = hasCoords
    ? `https://waze.com/ul?ll=${data.latitude},${data.longitude}&navigate=yes`
    : mapQuery
      ? `https://waze.com/ul?q=${encodeURIComponent(mapQuery)}&navigate=yes`
      : '';

  return (
    <div className="min-h-screen bg-secondary pb-12" dir="rtl">
      <div className="mx-auto max-w-4xl space-y-5 px-4 pt-5">
        <Card className="overflow-hidden">
          <div className="relative aspect-[16/10] w-full bg-muted">
            {cover ? (
              <img src={cover} alt={data.title} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImageIcon className="h-10 w-10" />
              </div>
            )}
            {data.dealType && (
              <Badge className="absolute end-3 top-3">{data.dealType === 'rent' ? 'להשכרה' : 'למכירה'}</Badge>
            )}
          </div>

          {data.photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto p-3">
              {data.photos.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setSlide(i)}
                  className={`h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 ${
                    i === slide ? 'border-primary' : 'border-transparent opacity-70'
                  }`}
                >
                  <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}

          <BrokerAttribution
            brokerName={data.brokerName}
            officeName={data.officeName}
            licenceNumber={data.brokerLicenceNumber}
            logoUrl={data.agencyLogoUrl}
          />

          <CardContent className="space-y-4 pt-4 text-right">
            <div className="space-y-1">
              <h1 className="text-2xl font-black leading-tight md:text-3xl">{data.title}</h1>
              {data.location && (
                <p className="flex items-center justify-end gap-1 text-sm text-muted-foreground">
                  <span>{data.location}</span>
                  <MapPin className="h-4 w-4" />
                </p>
              )}
            </div>

            <p className="text-2xl font-black text-primary" dir="ltr">
              {formatPrice(data.price, data.dealType)}
            </p>

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

            {data.details.length > 0 && (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 border-t pt-4 sm:grid-cols-2">
                {data.details.map((detail, index) => (
                  <div key={`${detail.label}-${index}`} className="min-w-0">
                    <dt className="text-xs font-semibold text-muted-foreground">{detail.label}</dt>
                    <dd className="mt-1 break-words text-sm text-foreground">{detail.value}</dd>
                  </div>
                ))}
              </dl>
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

            {(mapEmbed || googleUrl) && (
              <div className="border-t pt-4">
                <h2 className="mb-2 text-sm font-bold text-foreground">מיקום והגעה</h2>
                {mapEmbed && (
                  <iframe
                    title="מיקום הנכס על המפה"
                    src={mapEmbed}
                    loading="lazy"
                    className="h-56 w-full rounded-lg border"
                  />
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {googleUrl && (
                    <Button asChild variant="outline" size="sm">
                      <a href={googleUrl} target="_blank" rel="noopener noreferrer">
                        <MapPin className="h-4 w-4" /> ניווט ב-Google Maps
                      </a>
                    </Button>
                  )}
                  {wazeUrl && (
                    <Button asChild variant="outline" size="sm">
                      <a href={wazeUrl} target="_blank" rel="noopener noreferrer">
                        <Navigation className="h-4 w-4" /> ניווט ב-Waze
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button asChild className="flex-1">
                <a href={officialWaLink(waText)} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon className="h-4 w-4" /> תיאום צפייה בוואטסאפ
                </a>
              </Button>
              <Button variant="outline" onClick={handleShare}>
                <Share2 className="h-4 w-4" /> שיתוף
              </Button>
            </div>
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
