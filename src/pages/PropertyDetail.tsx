import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BedDouble, Ruler, MapPin, Building2, ArrowRight, Phone, Mail,
  Calendar, Layers, Send, Home, User, Receipt,
  Car, ArrowUpCircle, Wind, Shield, Sun, ExternalLink,
} from 'lucide-react';
import {
  PROPERTY_TYPE_LABELS_HE,
  type HomelyProperty,
  type PropertyType,
} from '@/lib/homelyMockProperties';
import { ShareWithLeadDialog } from '@/components/properties/ShareWithLeadDialog';
import { ProjectAlternativesCard } from '@/components/properties/ProjectAlternativesCard';

function formatPrice(n: number) {
  return `₪${n.toLocaleString('he-IL')}`;
}

const META_LABELS: Record<string, string> = {
  monthly_rent: 'שכר דירה חודשי',
  arnona_bimonthly: 'ארנונה (לחודשיים)',
  arnona: 'ארנונה',
  vaad_bayit: 'ועד בית',
  deposit: 'פיקדון',
  total_floors: 'סה"כ קומות בבניין',
  year_built: 'שנת בנייה',
  entry_date: 'תאריך כניסה',
  furnished: 'ריהוט',
  agent: 'סוכן',
  agent_serial: 'מספר סוכן',
  agent_phone: 'טלפון סוכן',
  owner_name: 'בעלים',
  owner_phone: 'טלפון בעלים',
  source_pdf: 'מקור (קובץ)',
  last_published: 'פרסום אחרון',
  last_updated: 'עדכון אחרון',
  exclusivity_until: 'בלעדיות עד',
};

function formatMetaValue(key: string, value: any): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'כן' : 'לא';
  if (typeof value === 'number') {
    if (/(rent|arnona|vaad|deposit|price)/i.test(key)) return `₪${value.toLocaleString('he-IL')}`;
    return value.toLocaleString('he-IL');
  }
  return String(value);
}

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activePhoto, setActivePhoto] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['property-detail', id],
    enabled: !!id,
    // Prevent auto-refresh / window-focus refetch loops that cause page blink.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: row } = await supabase
        .from('listings')
        .select('id, property_title, description, asking_price, features, slug, source_metadata, city, neighborhood, address, rooms, sqm, floor, parking, elevator, status, source_url, project_name')
        .eq('id', id!)
        .maybeSingle();
      if (!row) return null;
      const features = Array.isArray(row.features) ? row.features : [];
      const meta = ((row as any).source_metadata || {}) as Record<string, any>;

      // Photos: prefer source_metadata.photos, fall back to features array.
      const metaPhotos: string[] = Array.isArray(meta.photos)
        ? meta.photos.filter((s: any) => typeof s === 'string' && /^https?:\/\//.test(s))
        : [];
      const featurePhotos: string[] = (features as any[])
        .map((f) => (typeof f === 'string' ? f : (f as any)?.photo || (f as any)?.image_url))
        .filter((s: any) => typeof s === 'string' && /^https?:\/\//.test(s));
      const photos = Array.from(new Set([...metaPhotos, ...featurePhotos]));

      const dealType = String(meta.deal_type ?? meta.listing_type ?? '').toLowerCase();
      const priceNum = Number(row.asking_price) || 0;
      // Price-based heuristic: < 50k => rent, >= 500k => sale.
      // Falls back to dealType only in the ambiguous 50k–500k band.
      let listingType: 'sale' | 'rent';
      if (priceNum > 0 && priceNum < 50_000) listingType = 'rent';
      else if (priceNum >= 500_000) listingType = 'sale';
      else listingType = dealType === 'rent' ? 'rent' : 'sale';
      const textFeatures = (features as any[]).filter((f) => typeof f === 'string') as string[];

      const property = {
        id: String(row.id),
        source: 'listings',
        title: row.property_title || 'נכס',
        description: row.description || '',
        price: Number(row.asking_price) || 0,
        currency: '₪',
        city: row.city || meta.city || '',
        address: row.address || meta.address || (row.neighborhood ? String(row.neighborhood) : ''),
        rooms: Number(row.rooms ?? meta.rooms ?? 0),
        size_sqm: Number(row.sqm ?? meta.size_sqm ?? meta.sqm ?? 0),
        floor: row.floor != null ? Number(row.floor) : (meta.floor != null ? Number(meta.floor) : undefined),
        total_floors: meta.total_floors != null ? Number(meta.total_floors) : undefined,
        year_built: meta.year_built != null ? Number(meta.year_built) : undefined,
        property_type: (meta.property_type as PropertyType) || 'apartment',
        listing_type: listingType,
        photos,
        url: row.slug ? `/listing/${row.slug}` : (row.source_url || null),
        features: Array.from(new Set(textFeatures)),
      } as HomelyProperty;

      const amenities = {
        parking: Number(row.parking ?? meta.parking ?? 0) || 0,
        elevator: Boolean(row.elevator ?? meta.elevator ?? false),
        ac: Boolean(meta.ac ?? meta.air_conditioning ?? false),
        shelter: Boolean(meta.shelter ?? meta.mamad ?? false),
        solar: Boolean(meta.solar_heater ?? meta.solar ?? false),
      };

      return {
        property,
        meta,
        amenities,
        neighborhood: (row as any).neighborhood as string | null,
        projectName: (row as any).project_name as string | null,
        sourceUrl: (row as any).source_url as string | null,
      };
    },
  });

  const property = data?.property;
  const meta: Record<string, any> = data?.meta || {};
  const neighborhood = data?.neighborhood;
  const projectName = data?.projectName ?? null;
  const sourceUrl = data?.sourceUrl ?? null;
  const amenities = data?.amenities;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4" dir="rtl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="p-6 space-y-4 text-center" dir="rtl">
        <h1 className="text-2xl font-bold tracking-tight text-primary">הנכס לא נמצא</h1>
        <p className="text-muted-foreground">ייתכן שהקישור פג תוקף או שהנכס הוסר מהקטלוג.</p>
        <Button onClick={() => navigate('/properties')} variant="outline" className="gap-2">
          <ArrowRight className="h-4 w-4" /> חזרה לקטלוג
        </Button>
      </div>
    );
  }

  const isRent = property.listing_type === 'rent';
  const photos = property.photos.length ? property.photos : [];
  const main = photos[activePhoto];

  const propertyTypeHe = PROPERTY_TYPE_LABELS_HE[property.property_type] || 'נכס';
  const transactionHe = isRent ? 'להשכרה' : 'למכירה';
  // Dynamic headline e.g. "דירה להשכרה, הרצליה הירוקה, נווה עובד, הרצליה"
  const headlineParts = [
    `${propertyTypeHe} ${transactionHe}`,
    property.address || null,
    neighborhood || null,
    property.city || null,
  ].filter((s): s is string => Boolean(s && String(s).trim()));
  // de-duplicate identical fragments (e.g. address === neighborhood)
  const seen = new Set<string>();
  const headline = headlineParts.filter((p) => {
    const k = p.trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).join(', ');

  // Financials / owner blocks
  const financialKeys = ['monthly_rent', 'arnona_bimonthly', 'arnona', 'vaad_bayit', 'deposit'];
  const ownerKeys = ['owner_name', 'owner_phone', 'agent', 'agent_serial', 'agent_phone'];
  const financialEntries = financialKeys
    .filter((k) => meta[k] != null && meta[k] !== '')
    .map((k) => [k, meta[k]] as const);
  const ownerEntries = ownerKeys
    .filter((k) => meta[k] != null && meta[k] !== '')
    .map((k) => [k, meta[k]] as const);

  return (
    <div className="p-3 sm:p-6 space-y-6" dir="rtl">
      {/* Floating back arrow — positioned on opposite edge of the burger/sidebar trigger (LTR-left in RTL layout) */}
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          aria-label="חזרה לקטלוג הנכסים"
          onClick={() => navigate('/properties')}
          className="h-9 w-9 rounded-full text-foreground hover:bg-foreground/10"
        >
          <ArrowRight className="h-5 w-5 rotate-180" />
        </Button>
      </div>

      {/* Headline + price */}
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">
          {headline || property.title}
        </h1>

        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="text-3xl font-extrabold text-success tabular-nums">
            {formatPrice(property.price)}
            {isRent && <span className="text-base font-normal text-muted-foreground"> /חודש</span>}
            {property.size_sqm ? (
              <p className="text-xs text-muted-foreground mt-1 font-normal">
                {formatPrice(Math.round(property.price / property.size_sqm))} למ"ר
              </p>
            ) : null}
          </div>
          <span
            className={`text-lg font-bold ${isRent ? 'text-amber-600' : 'text-primary'}`}
          >
            {transactionHe}
          </span>
        </div>
      </header>

      {/* Gallery + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <Card className="overflow-hidden">
            <div className="aspect-[16/10] bg-muted relative">
              {main ? (
                <img src={main} alt={property.title} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground">אין תמונה</div>
              )}
            </div>
          </Card>
          {photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {photos.map((p, i) => (
                <button
                  key={i}
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

          {/* Specs grid — amenities merged in */}
          <Card className="p-4 sm:p-5">
            <h2 className="text-base font-bold text-primary mb-4">מאפייני הנכס</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Spec icon={BedDouble} label="חדרים" value={property.rooms ? `${property.rooms}` : '—'} />
              <Spec icon={Ruler} label="שטח" value={property.size_sqm ? `${property.size_sqm} מ"ר` : '—'} />
              <Spec
                icon={Layers}
                label="קומה"
                value={property.floor != null ? `${property.floor}${property.total_floors ? ` / ${property.total_floors}` : ''}` : '—'}
              />
              <Spec icon={Calendar} label="שנת בנייה" value={property.year_built ? `${property.year_built}` : '—'} />
              <Spec icon={Home} label="סוג נכס" value={propertyTypeHe} />
              <Spec icon={MapPin} label="עיר" value={property.city || '—'} />
              <Spec icon={MapPin} label="שכונה" value={neighborhood || '—'} />
              <Spec icon={Building2} label="מצב" value={transactionHe} />

              {/* Amenities — merged into the same grid */}
              {amenities && amenities.parking > 0 && (
                <Spec icon={Car} label="חניה" value={`${amenities.parking}`} />
              )}
              {amenities?.elevator && (
                <Spec icon={ArrowUpCircle} label="מעלית" value="כן" />
              )}
              {amenities?.ac && (
                <Spec icon={Wind} label="מיזוג" value="כן" />
              )}
              {amenities?.shelter && (
                <Spec icon={Shield} label='ממ"ד / מקלט' value="כן" />
              )}
              {amenities?.solar && (
                <Spec icon={Sun} label="דוד שמש" value="כן" />
              )}
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

          {/* Description */}
          {property.description && (
            <Card className="p-4 sm:p-5">
              <h2 className="text-base font-bold text-primary mb-2">תיאור הנכס</h2>
              <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-line">{property.description}</p>
            </Card>
          )}

          {/* Financials */}
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

          {/* Owner / Agent */}
          {ownerEntries.length > 0 && (
            <Card className="p-4 sm:p-5">
              <h2 className="text-base font-bold text-primary mb-3 inline-flex items-center gap-2">
                <User className="h-4 w-4" /> בעלים וסוכן מטפל
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {ownerEntries.map(([k, v]) => (
                  <Spec key={k} icon={User} label={META_LABELS[k] || k} value={formatMetaValue(k, v)} />
                ))}
              </div>
            </Card>
          )}

          {projectName && (
            <ProjectAlternativesCard
              currentListingId={property.id}
              projectName={projectName}
            />
          )}
        </div>

        {/* Agent sidebar */}
        <aside className="space-y-4">
          {property.agent && (
            <Card className="p-5">
              <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">הסוכן המטפל</h2>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-14 w-14 rounded-full bg-primary/10 grid place-items-center text-primary font-bold text-lg">
                  {property.agent.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-foreground truncate">{property.agent.name}</p>
                  {property.agent.agency && (
                    <p className="text-xs text-muted-foreground truncate">{property.agent.agency}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <a
                  href={`tel:${property.agent.phone}`}
                  className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors"
                >
                  <Phone className="h-4 w-4 text-primary" /> {property.agent.phone}
                </a>
                <a
                  href={`mailto:${property.agent.email}`}
                  className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors"
                >
                  <Mail className="h-4 w-4 text-primary" /> {property.agent.email}
                </a>
              </div>
              <div className="mt-5 grid gap-2">
                <Button className="w-full gap-2" onClick={() => setShareOpen(true)}>
                  <Send className="h-4 w-4" /> שתף עם מתעניין
                </Button>
                <Button variant="outline" className="w-full gap-2" asChild>
                  <a href={`tel:${property.agent.phone}`}>
                    <Phone className="h-4 w-4" /> התקשר לסוכן
                  </a>
                </Button>
              </div>
            </Card>
          )}
        </aside>
      </div>

      <ShareWithLeadDialog
        property={property}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
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
