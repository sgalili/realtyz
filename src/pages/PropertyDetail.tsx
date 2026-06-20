import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  BedDouble, Ruler, MapPin, ArrowRight, Phone, Mail,
  Calendar, Layers, Send, Home, User, Receipt,
  Car, ArrowUpCircle, Wind, Shield, Sun, ExternalLink, Pencil, Save, X,
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
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function photoUrlFrom(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return /^https?:\/\//.test(value) ? value : null;
  if (isRecord(value)) {
    const candidate = value.url || value.src || value.photo || value.image_url || value.image;
    return typeof candidate === 'string' && /^https?:\/\//.test(candidate) ? candidate : null;
  }
  return null;
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

const PROPERTY_TYPE_OPTIONS: PropertyType[] = [
  'apartment', 'penthouse', 'garden_apt', 'duplex', 'house', 'cottage', 'studio', 'commercial', 'land', 'other'
] as PropertyType[];

type EditableFields = {
  city: string;
  neighborhood: string;
  address: string;
  rooms: string;
  sqm: string;
  floor: string;
  total_floors: string;
  year_built: string;
  property_type: string;
  price: string;
  vaad_bayit: string;
  arnona_bimonthly: string;
  payments: string;
  entry_date: string;
  description: string;
};

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activePhoto, setActivePhoto] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditableFields | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['property-detail', id],
    enabled: !!id,
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
      const meta = isRecord(row.source_metadata) ? row.source_metadata : {};

      const photoSources: unknown[] = [
        ...(Array.isArray(meta?.photos) ? (meta.photos as unknown[]) : []),
        ...(Array.isArray(meta?.images) ? (meta.images as unknown[]) : []),
      ];
      if (typeof meta?.image === 'string') photoSources.push(meta.image);
      if (typeof meta?.image_url === 'string') photoSources.push(meta.image_url);
      const photos = Array.from(
        new Set(photoSources.map(photoUrlFrom).filter((s): s is string => !!s))
      );

      const priceNum = Number(row.asking_price) || 0;
      const dealType = String((meta as JsonRecord).deal_type ?? (meta as JsonRecord).listing_type ?? '').toLowerCase();
      let listingType: 'sale' | 'rent';
      if (priceNum > 0 && priceNum < 50_000) listingType = 'rent';
      else if (priceNum >= 500_000) listingType = 'sale';
      else listingType = dealType === 'rent' ? 'rent' : 'sale';
      const textFeatures = features.filter((f): f is string => typeof f === 'string');

      const property = {
        id: String(row.id),
        source: 'listings',
        title: row.property_title || 'נכס',
        description: row.description || '',
        price: priceNum,
        currency: '₪',
        city: row.city || (meta.city as string) || '',
        address: row.address || (meta.address as string) || (row.neighborhood ? String(row.neighborhood) : ''),
        rooms: Number(row.rooms ?? meta.rooms ?? 0),
        size_sqm: Number(row.sqm ?? meta.size_sqm ?? meta.sqm ?? 0),
        floor: row.floor != null ? Number(row.floor) : (meta.floor != null ? Number(meta.floor) : undefined),
        total_floors: meta.total_floors != null ? Number(meta.total_floors) : undefined,
        year_built: meta.year_built != null ? Number(meta.year_built) : undefined,
        property_type: ((meta.property_type as PropertyType) || 'apartment') as PropertyType,
        listing_type: listingType,
        photos,
        url: row.source_url || (row.slug ? `/listing/${row.slug}` : null),
        features: Array.from(new Set(textFeatures)),
      } as HomelyProperty;

      const amenities = {
        parking: Number(meta.parking ?? row.parking ?? 0) || 0,
        elevator: Boolean(row.elevator ?? meta.elevator ?? false),
        ac: Boolean(meta.ac ?? meta.air_conditioning ?? false),
        shelter: Boolean(meta.shelter ?? meta.mamad ?? false),
        solar: Boolean(meta.solar_heater ?? meta.solar ?? false),
      };

      return {
        row,
        property,
        meta,
        amenities,
        neighborhood: row.neighborhood,
        projectName: row.project_name,
        sourceUrl: row.source_url,
      };
    },
  });

  const property = data?.property;
  const meta: JsonRecord = data?.meta || {};
  const neighborhood = data?.neighborhood;
  const projectName = data?.projectName ?? null;
  const sourceUrl = data?.sourceUrl ?? null;
  const amenities = data?.amenities;

  // Initialize edit form when entering edit mode
  useEffect(() => {
    if (editMode && property && !form) {
      setForm({
        city: property.city || '',
        neighborhood: neighborhood || '',
        address: property.address || '',
        rooms: property.rooms ? String(property.rooms) : '',
        sqm: property.size_sqm ? String(property.size_sqm) : '',
        floor: property.floor != null ? String(property.floor) : '',
        total_floors: property.total_floors != null ? String(property.total_floors) : '',
        year_built: property.year_built != null ? String(property.year_built) : '',
        property_type: property.property_type || 'apartment',
        price: String(property.price || ''),
        vaad_bayit: String(meta.vaad_bayit ?? meta.vaad_monthly ?? ''),
        arnona_bimonthly: String(meta.arnona_bimonthly ?? meta.arnona ?? ''),
        payments: String(meta.payments ?? meta.payment_count ?? ''),
        entry_date: String(meta.entry_date ?? meta.delivery_date ?? ''),
        description: property.description || '',
      });
    }
    if (!editMode) setForm(null);
  }, [editMode, property, neighborhood, meta, form]);

  const handleSave = async () => {
    if (!form || !id) return;
    setSaving(true);
    try {
      const newMeta = {
        ...(data?.meta || {}),
        vaad_bayit: form.vaad_bayit ? Number(form.vaad_bayit) : null,
        arnona_bimonthly: form.arnona_bimonthly ? Number(form.arnona_bimonthly) : null,
        payments: form.payments ? Number(form.payments) : null,
        entry_date: form.entry_date || null,
        total_floors: form.total_floors ? Number(form.total_floors) : null,
        year_built: form.year_built ? Number(form.year_built) : null,
        property_type: form.property_type,
      };
      const { error } = await supabase.from('listings').update({
        city: form.city || null,
        neighborhood: form.neighborhood || null,
        address: form.address || null,
        rooms: form.rooms ? Number(form.rooms) : null,
        sqm: form.sqm ? Number(form.sqm) : null,
        floor: form.floor ? Number(form.floor) : null,
        asking_price: form.price ? Number(form.price) : 0,
        description: form.description || null,
        source_metadata: newMeta as never,
      }).eq('id', id);
      if (error) throw error;
      toast.success('הנכס עודכן בהצלחה');
      setEditMode(false);
      await qc.invalidateQueries({ queryKey: ['property-detail', id] });
    } catch (e: any) {
      toast.error(`שגיאה בשמירה: ${e.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

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

  const isRent = property.price < 50_000;
  const photos = property.photos || [];
  const main = photos[activePhoto];

  const propertyTypeHe = PROPERTY_TYPE_LABELS_HE[property.property_type] || 'דירה';
  const transactionHe = isRent ? 'להשכרה' : 'למכירה';
  // Dynamic headline — NO hardcoded fallbacks like "נווה עובד"/"הרצליה הירוקה".
  const headlineParts = [
    `${propertyTypeHe} ${transactionHe}`,
    neighborhood || null,
    property.city || null,
  ].filter(Boolean);
  const dynamicHeadline = headlineParts.join(', ');

  const pricePerMeter = property.size_sqm ? Math.round(property.price / property.size_sqm).toLocaleString('he-IL') : null;
  const vaadBayit = Number(meta.vaad_bayit ?? meta.vaad_monthly ?? 0) || 0;
  const arnonaBimonthly = Number(meta.arnona_bimonthly ?? meta.arnona ?? 0) || 0;
  const payments = Number(meta.payments ?? meta.payment_count ?? 0) || 0;
  const entryDate = String(meta.entry_date ?? meta.delivery_date ?? 'כניסה גמישה');

  const financialKeys = ['monthly_rent', 'arnona_bimonthly', 'arnona', 'vaad_bayit', 'deposit'];
  const financialEntries = financialKeys
    .filter((k) => meta[k] != null && meta[k] !== '')
    .map((k) => [k, meta[k]] as const);

  const setField = (k: keyof EditableFields, v: string) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div className="p-3 sm:p-6 space-y-6" dir="rtl">
      {/* Action row */}
      <div className="flex items-center justify-end gap-2">
        {!editMode ? (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditMode(true)}>
            <Pencil className="h-4 w-4" /> עריכת נכס
          </Button>
        ) : (
          <>
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setEditMode(false)} disabled={saving}>
              <X className="h-4 w-4" /> ביטול
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4" /> {saving ? 'שומר...' : 'שמירה'}
            </Button>
          </>
        )}
      </div>

      {/* Headline + price */}
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
            {dynamicHeadline}
          </div>
        </div>

        <div className="flex items-baseline gap-3 flex-wrap">
          {editMode && form ? (
            <Input
              type="number"
              value={form.price}
              onChange={(e) => setField('price', e.target.value)}
              className="max-w-xs"
              placeholder="מחיר"
            />
          ) : (
            <>
              <span className="text-3xl font-extrabold text-success tabular-nums">
                {formatPrice(property.price)}
                {isRent && <span className="text-base font-normal text-muted-foreground"> /חודש</span>}
              </span>
              {pricePerMeter ? (
                <span className="text-xs text-muted-foreground font-normal">
                  ({pricePerMeter} ₪ למ"ר)
                </span>
              ) : null}
            </>
          )}
        </div>
      </header>

      {/* Gallery + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <Card className="overflow-hidden">
            <div className="aspect-[16/10] bg-muted relative">
              {main ? (
                <img src={main} alt={dynamicHeadline} className="h-full w-full object-cover" />
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

          {/* Specs grid — editable in edit mode */}
          <Card className="p-4 sm:p-5">
            <h2 className="text-base font-bold text-primary mb-4">מאפייני הנכס</h2>
            {editMode && form ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label="חדרים"><Input type="number" step="0.5" value={form.rooms} onChange={(e) => setField('rooms', e.target.value)} /></Field>
                <Field label='שטח (מ"ר)'><Input type="number" value={form.sqm} onChange={(e) => setField('sqm', e.target.value)} /></Field>
                <Field label="קומה"><Input type="number" value={form.floor} onChange={(e) => setField('floor', e.target.value)} /></Field>
                <Field label='סה"כ קומות'><Input type="number" value={form.total_floors} onChange={(e) => setField('total_floors', e.target.value)} /></Field>
                <Field label="שנת בנייה"><Input type="number" value={form.year_built} onChange={(e) => setField('year_built', e.target.value)} /></Field>
                <Field label="סוג נכס">
                  <select
                    value={form.property_type}
                    onChange={(e) => setField('property_type', e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {PROPERTY_TYPE_OPTIONS.map((pt) => (
                      <option key={pt} value={pt}>{PROPERTY_TYPE_LABELS_HE[pt] || pt}</option>
                    ))}
                  </select>
                </Field>
                <Field label="עיר"><Input value={form.city} onChange={(e) => setField('city', e.target.value)} /></Field>
                <Field label="שכונה"><Input value={form.neighborhood} onChange={(e) => setField('neighborhood', e.target.value)} /></Field>
                <Field label="כתובת"><Input value={form.address} onChange={(e) => setField('address', e.target.value)} /></Field>
                <Field label="ועד בית (לחודש)"><Input type="number" value={form.vaad_bayit} onChange={(e) => setField('vaad_bayit', e.target.value)} /></Field>
                <Field label="ארנונה (לחודשיים)"><Input type="number" value={form.arnona_bimonthly} onChange={(e) => setField('arnona_bimonthly', e.target.value)} /></Field>
                <Field label="מספר תשלומים"><Input type="number" value={form.payments} onChange={(e) => setField('payments', e.target.value)} /></Field>
                <Field label="תאריך כניסה"><Input value={form.entry_date} onChange={(e) => setField('entry_date', e.target.value)} placeholder="מיידי / 01/08/2026" /></Field>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Spec icon={BedDouble} label="חדרים" value={property.rooms ? `${property.rooms}` : '—'} />
                <Spec icon={Ruler} label='שטח' value={property.size_sqm ? `${property.size_sqm} מ"ר` : '—'} />
                <Spec
                  icon={Layers}
                  label="קומה"
                  value={property.floor != null ? `${property.floor}${property.total_floors ? ` / ${property.total_floors}` : ''}` : '—'}
                />
                <Spec icon={Calendar} label="שנת בנייה" value={property.year_built ? `${property.year_built}` : '—'} />
                <Spec icon={Home} label="סוג נכס" value={propertyTypeHe} />
                <Spec icon={MapPin} label="עיר" value={property.city || '—'} />
                <Spec icon={MapPin} label="שכונה" value={neighborhood || '—'} />
                <Spec icon={Receipt} label="ועד בית (לחודש)" value={vaadBayit ? `${vaadBayit.toLocaleString('he-IL')} ₪` : '—'} />
                <Spec icon={Receipt} label="ארנונה (לחודשיים)" value={arnonaBimonthly ? `${arnonaBimonthly.toLocaleString('he-IL')} ₪` : '—'} />
                <Spec icon={Receipt} label="מספר תשלומים" value={payments ? `${payments}` : '—'} />
                <Spec icon={Car} label="חניות" value={`${amenities?.parking ?? 0}`} />
                <Spec icon={Calendar} label="תאריך כניסה" value={entryDate} />
                {amenities?.elevator && <Spec icon={ArrowUpCircle} label="מעלית" value="כן" />}
                {amenities?.ac && <Spec icon={Wind} label="מיזוג" value="כן" />}
                {amenities?.shelter && <Spec icon={Shield} label='ממ"ד / מקלט' value="כן" />}
                {amenities?.solar && <Spec icon={Sun} label="דוד שמש" value="כן" />}
              </div>
            )}

            {sourceUrl && !editMode && (
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
          {(editMode || property.description) && (
            <Card className="p-4 sm:p-5">
              <h2 className="text-base font-bold text-primary mb-2">תיאור הנכס</h2>
              {editMode && form ? (
                <Textarea
                  dir="rtl"
                  rows={8}
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                />
              ) : (
                <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-line">{property.description}</p>
              )}
            </Card>
          )}

          {!editMode && financialEntries.length > 0 && (
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

          {projectName && !editMode && (
            <ProjectAlternativesCard
              currentListingId={property.id}
              projectName={projectName}
            />
          )}
        </div>

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
                <a href={`tel:${property.agent.phone}`} className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors">
                  <Phone className="h-4 w-4 text-primary" /> {property.agent.phone}
                </a>
                <a href={`mailto:${property.agent.email}`} className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors">
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] text-muted-foreground uppercase tracking-wide block">{label}</label>
      {children}
    </div>
  );
}
