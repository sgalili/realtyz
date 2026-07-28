import { useState, useEffect, useRef } from 'react';
import { ensureFullPropertyImport, isListingFullyImported, ensureMetadataImport, isListingMetadataImported } from '@/lib/propertyFullSync';
import { useParams, useNavigate, Link } from 'react-router-dom';
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
  Trash2, Plus, Upload, Image as ImageIcon, Images, Loader2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import {
  PROPERTY_TYPE_LABELS_HE,
  type HomelyProperty,
  type PropertyType,
} from '@/lib/homelyMockProperties';
import { ShareWithLeadDialog } from '@/components/properties/ShareWithLeadDialog';
import { PropertyShareMenu } from '@/components/properties/PropertyShareMenu';
import { ProjectAlternativesCard } from '@/components/properties/ProjectAlternativesCard';
import { AreaMarketFactsCard } from '@/components/properties/AreaMarketFactsCard';
import { PropertyRichDetailsCard } from '@/components/properties/PropertyRichDetailsCard';
import { Yad2Icon } from '@/components/properties/Yad2Icon';
import { uploadMediaToLibrary } from '@/lib/mediaUpload';
import { normalizeImageUrls } from '@/lib/imageHealth';
import { stripAddressNumbers } from '@/lib/formatAddress';
import { formatInternalListingTitle } from '@/lib/formatListingTitle';
import { sourcePhotoCount } from '@/lib/photoCount';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { buildDescriptionBlocks, sanitizeDescription } from '@/lib/descriptionBlocks';

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

function boolFromMeta(value: unknown): boolean | null {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim();
  if (/^(1|true|yes|כן|יש|y)$/i.test(s)) return true;
  if (/^(0|false|no|לא|אין|n)$/i.test(s)) return false;
  const n = Number(s.replace(/[^\d.-]/g, ''));
  if (Number.isFinite(n)) return n > 0;
  if (/מרפסת|balcony/i.test(s)) return true;
  return null;
}

const PROPERTY_TYPE_OPTIONS: PropertyType[] = [
  'apartment', 'penthouse', 'garden_apt', 'duplex', 'house', 'cottage', 'studio', 'commercial', 'land', 'other'
] as PropertyType[];

type EditableFields = {
  title: string;
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
  parking: string;
  elevator: boolean;
  balcony: boolean;
  ac: boolean;
  shelter: boolean;
  solar: boolean;
  source_url: string;
  photos: string[];
  photo_url_draft: string;
};

const draftStorageKey = (id: string | undefined) => (id ? `realtyz:property-draft:${id}` : null);

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activePhoto, setActivePhoto] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [pullingImages, setPullingImages] = useState(false);
  // Determinate progress (0-100) for the gallery ring loader.
  const [imageProgress, setImageProgress] = useState(0);
  const galleryPulledRef = useRef(false);
  const [form, setForm] = useState<EditableFields | null>(null);
  const [initialFormSnapshot, setInitialFormSnapshot] = useState<string>('');

  // Detect unsaved changes by comparing serialized form vs. snapshot taken
  // when edit mode opened (or when a draft was restored).
  const isDirty = editMode && !!form && JSON.stringify(form) !== initialFormSnapshot;

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
        .select('id, property_title, description, asking_price, features, slug, source_metadata, city, neighborhood, address, rooms, sqm, floor, parking, elevator, status, source_url, source, project_name, media_photos, media_documents, updated_at, owner_id, short_description, long_description, latitude, longitude, furniture_details, additional_details, price_history, attributes, available_from, house_number, apartment_number')
        .eq('id', id!)
        .maybeSingle();
      if (!row) return null;
      console.log('[PropertyDetail listing]', row);
      console.log('[PropertyDetail listing.media_photos]', (row as any).media_photos);
      console.log('[PropertyDetail listing.source_metadata]', row.source_metadata);
      const features = Array.isArray(row.features) ? row.features : [];
      const meta = isRecord(row.source_metadata) ? row.source_metadata : {};

      const photoSources: unknown[] = Array.isArray((row as any).media_photos)
        ? ((row as any).media_photos as unknown[])
        : [];
      const photos = normalizeImageUrls(photoSources.map(photoUrlFrom).filter((s): s is string => !!s));

      const docsRaw: unknown[] = [
        ...(Array.isArray((row as any).media_documents) ? ((row as any).media_documents as unknown[]) : []),
        ...(Array.isArray((meta as any)?.documents) ? ((meta as any).documents as unknown[]) : []),
      ];
      const documents = Array.from(new Set(
        docsRaw
          .map((d: any) => {
            if (typeof d === 'string') return { url: d, name: d.split('/').pop() || 'מסמך' };
            if (d && typeof d === 'object') {
              const url = d.url || d.Url || d.path || d.href;
              if (typeof url === 'string') return { url, name: String(d.name || d.title || url.split('/').pop() || 'מסמך') };
            }
            return null;
          })
          .filter((x): x is { url: string; name: string } => !!x && /^https?:\/\//.test(x.url))
          .map((x) => JSON.stringify(x))
      )).map((s) => JSON.parse(s) as { url: string; name: string });

      const priceNum = Number(row.asking_price) || 0;
      const dealType = String((meta as JsonRecord).deal_type ?? (meta as JsonRecord).listing_type ?? '').toLowerCase();
      let listingType: 'sale' | 'rent';
      if (priceNum > 0 && priceNum < 50_000) listingType = 'rent';
      else if (priceNum >= 500_000) listingType = 'sale';
      else listingType = dealType === 'rent' ? 'rent' : 'sale';
      const textFeatures = features.filter((f): f is string => typeof f === 'string');
      const featuresObject = ((features as unknown[]).find(isRecord) ?? {}) as JsonRecord;
      const extras = isRecord(featuresObject.extras) ? featuresObject.extras : {};
      const balconyRaw = meta.balcony ?? meta.mirpeset ?? extras.balcony ?? (isRecord(meta.homely_raw) ? meta.homely_raw.mirpesetShemeshYN ?? meta.homely_raw.balcony : null);
      const balcony = boolFromMeta(balconyRaw) ?? (textFeatures.some((f) => /מרפסת|balcony/i.test(f)) ? true : null);
      const enrichedFeatures = Array.from(new Set([...textFeatures, ...(balcony === true ? ['מרפסת'] : [])]));

      const property = {
        id: String(row.id),
        source: 'listings',
        title: row.property_title || 'נכס',
        description: sanitizeDescription(row.description) || '',
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
        features: enrichedFeatures,
      } as HomelyProperty;

      const elevatorVal = row.elevator ?? meta.elevator ?? meta.maalit ?? extras.elevator;
      const elevator = elevatorVal == null || elevatorVal === ''
        ? false
        : typeof elevatorVal === 'boolean'
          ? elevatorVal
          : !/^(0|לא|no|false|אין)$/i.test(String(elevatorVal).trim());
      const amenities = {
        parking: Number(meta.parking ?? row.parking ?? 0) || 0,
        elevator,
        balcony,
        ac: Boolean(meta.ac ?? meta.air_conditioning ?? extras.air_conditioning ?? false),
        shelter: Boolean(meta.shelter ?? meta.mamad ?? extras.safe_room ?? false),
        solar: Boolean(meta.solar_heater ?? meta.solar ?? false),
      };

      // Owner (linked crm_profile) — separate lightweight fetch.
      let owner: { id: string; full_name: string } | null = null;
      const ownerId = (row as any).owner_id as string | null;
      if (ownerId) {
        const { data: op } = await (supabase as any)
          .from('crm_profiles')
          .select('id, full_name')
          .eq('id', ownerId)
          .maybeSingle();
        if (op?.id) owner = { id: String(op.id), full_name: String(op.full_name || '') };
      }

      const r = row as any;
      return {
        row,
        property,
        meta,
        amenities,
        neighborhood: row.neighborhood,
        projectName: row.project_name,
        sourceUrl: row.source_url,
        documents,
        owner,
        rich: {
          aboutBlocks: buildDescriptionBlocks(r),
          about:
            sanitizeDescription(r.long_description as string | null) ||
            sanitizeDescription(r.short_description as string | null) ||
            sanitizeDescription(row.description as string | null) ||
            null,
          furniture: (r.furniture_details as Record<string, unknown> | null) ?? null,
          additional: (() => {
            const base = (r.additional_details && typeof r.additional_details === 'object' && !Array.isArray(r.additional_details)
              ? { ...(r.additional_details as Record<string, unknown>) }
              : {}) as Record<string, unknown>;
            // Guarantee the core secondary fields are always populated from the
            // listing columns when the scraped blob is missing them.
            if (base.floor == null && row.floor != null) base.floor = row.floor;
            if (base.parkingSpacesCount == null && (row as any).parking != null) {
              base.parkingSpacesCount = (row as any).parking;
            }
            if (base.squareMeterBuild == null && row.sqm != null) base.squareMeterBuild = row.sqm;
            if (base.rooms == null && row.rooms != null) base.rooms = row.rooms;
            return Object.keys(base).length ? base : null;
          })(),
          amenities: (r.attributes && typeof r.attributes === 'object' && !Array.isArray(r.attributes)
            ? (r.attributes as Record<string, unknown>)
            : null),
          priceHistory: Array.isArray(r.price_history) ? (r.price_history as any[]) : [],
          latitude: r.latitude != null ? Number(r.latitude) : null,
          longitude: r.longitude != null ? Number(r.longitude) : null,
        },
      };
    },
  });

  const property = data?.property;
  const meta: JsonRecord = data?.meta || {};
  const neighborhood = data?.neighborhood;
  const projectName = data?.projectName ?? null;
  const sourceUrl = data?.sourceUrl ?? null;
  const amenities = data?.amenities;
  const documents = data?.documents ?? [];

  const dbPhotos = property?.photos ?? [];

  // ---- Owner CRM card auto-provisioning -----------------------------------
  // Opening a property guarantees the owner exists in the global CRM using the
  // standard profile card template: name, phone, linked properties, plus the
  // official Meta WhatsApp Business profile picture. Runs once per listing.
  const ownerSyncedRef = useRef<string | null>(null);
  useEffect(() => {
    const listingId = data?.row?.id ? String(data.row.id) : null;
    if (!listingId || data?.owner) return;
    if (ownerSyncedRef.current === listingId) return;
    ownerSyncedRef.current = listingId;
    (async () => {
      try {
        const { data: res } = await supabase.functions.invoke('owner-crm-sync', {
          body: { listing_id: listingId },
        });
        if (res && ((res as any).created > 0 || (res as any).linked > 0)) {
          qc.invalidateQueries({ queryKey: ['property-detail', listingId] });
        }
      } catch {
        /* silent: owner enrichment must never block the detail view */
      }
    })();
  }, [data?.row?.id, data?.owner, qc]);



  // ---- Automatic on-view metadata hydration -------------------------------
  // When a property is opened and key Yad2 metadata is missing (ארנונה,
  // ועד בית, מספר תשלומים, or the "על הנכס" text), re-parse the source ad
  // once, persist it server-side, and refresh the view.
  const hydratedRef = useRef<string | null>(null);
  const [hydrating, setHydrating] = useState(false);
  // Determinate-looking progress for the metadata ring (0-100).
  const [hydrateProgress, setHydrateProgress] = useState(0);
  useEffect(() => {
    if (!hydrating) return;
    setHydrateProgress(8);
    const started = Date.now();
    const timer = setInterval(() => {
      setHydrateProgress((p) => {
        // Hard ceiling grows over time so the ring never parks at 92%.
        const elapsed = Date.now() - started;
        const ceiling = elapsed > 12000 ? 99 : elapsed > 6000 ? 97 : 92;
        if (p >= ceiling) return ceiling;
        return Math.min(ceiling, p + Math.max(2, Math.round((ceiling - p) / 8)));
      });
    }, 160);
    // Safety valve: never keep the loader up for more than 20s.
    const bail = setTimeout(() => {
      setHydrateProgress(100);
      setHydrating(false);
    }, 20000);
    return () => {
      clearInterval(timer);
      clearTimeout(bail);
    };
  }, [hydrating]);

  // Same easing for the gallery ring.
  useEffect(() => {
    if (!pullingImages) return;
    const started = Date.now();
    const timer = setInterval(() => {
      setImageProgress((p) => {
        const elapsed = Date.now() - started;
        const ceiling = elapsed > 10000 ? 99 : elapsed > 5000 ? 97 : 92;
        return p >= ceiling ? ceiling : Math.min(ceiling, p + Math.max(2, Math.round((ceiling - p) / 8)));
      });
    }, 160);
    return () => clearInterval(timer);
  }, [pullingImages]);




  useEffect(() => {
    if (!id || !data) return;
    if (hydratedRef.current === id) return;
    const src = data.sourceUrl;
    if (!src || !/yad2\.co\.il/i.test(src)) return;

    // Once a property's metadata has been hydrated it lives in our DB forever —
    // never scrape the source again (zero BrightData credits).
    const doneKey = `realtyz:meta:${id}`;
    try {
      if (window.localStorage.getItem(doneKey) || window.localStorage.getItem(`realtyz:imported:${id}`)) {
        hydratedRef.current = id;
        return;
      }
    } catch { /* private mode — fall through to the DB check */ }

    hydratedRef.current = id;
    let cancelled = false;

    (async () => {
      // DB-side guard: pre-hydrated rows render instantly, no loader at all.
      if (await isListingMetadataImported(id)) {
        if (cancelled) return;
        try { window.localStorage.setItem(doneKey, '1'); } catch { /* ignore */ }
        return;
      }
      if (cancelled) return;

      setHydrating(true);
      try {
        // Metadata only — images stay lazy until the user clicks an arrow.
        await ensureMetadataImport(id, src);
        try { window.localStorage.setItem(doneKey, '1'); } catch { /* ignore */ }
        // Refetch BEFORE closing the ring so the fresh values are on screen
        // the moment the loader disappears (no hard refresh needed).
        await qc.refetchQueries({ queryKey: ['property-detail', id] });
      } catch { /* keep the page usable */ }
      if (cancelled) return;
      setHydrateProgress(100);
      setTimeout(() => { if (!cancelled) setHydrating(false); }, 200);
    })();

    return () => { cancelled = true; };
  }, [id, data, qc]);





  // Initialize edit form when entering edit mode. Prefer a locally-persisted
  // draft (session/localStorage) over the fresh DB row so users never lose
  // in-progress edits after an accidental close/reload.
  useEffect(() => {
    if (editMode && property && !form) {
      const base: EditableFields = {
        title: property.title || '',
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
        parking: String(amenities?.parking ?? meta.parking ?? ''),
        elevator: Boolean(amenities?.elevator),
        balcony: Boolean(amenities?.balcony),
        ac: Boolean(amenities?.ac),
        shelter: Boolean(amenities?.shelter),
        solar: Boolean(amenities?.solar),
        source_url: sourceUrl || (typeof meta.source_url === 'string' ? meta.source_url : ''),
        photos: dbPhotos,
        photo_url_draft: '',
      };
      const key = draftStorageKey(id);
      let restored: EditableFields | null = null;
      if (key) {
        try {
          const raw = window.localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw) as Partial<EditableFields>;
            restored = { ...base, ...parsed, photo_url_draft: '' };
            toast.message('טיוטה שנשמרה מקומית שוחזרה');
          }
        } catch { /* ignore malformed drafts */ }
      }
      const next = restored ?? base;
      setForm(next);
      setInitialFormSnapshot(JSON.stringify(base));
    }
    if (!editMode) setForm(null);
  }, [editMode, property, neighborhood, meta, amenities, sourceUrl, form, dbPhotos, id]);

  // Persist current draft on every change, keyed to property id.
  useEffect(() => {
    const key = draftStorageKey(id);
    if (!key || !editMode || !form) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(form));
    } catch { /* quota / privacy mode — silently skip */ }
  }, [form, editMode, id]);

  // Warn on tab close / hard navigation while form is dirty.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const clearDraft = () => {
    const key = draftStorageKey(id);
    if (key) {
      try { window.localStorage.removeItem(key); } catch { /* noop */ }
    }
  };

  const requestExitEditMode = () => {
    if (isDirty) {
      const keep = window.confirm('יש שינויים שלא נשמרו. לשמור לפני יציאה?\n\nאישור = שמור, ביטול = מחק שינויים ויציאה.');
      if (keep) {
        void handleSave();
        return;
      }
      clearDraft();
    }
    setEditMode(false);
  };


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
        parking: form.parking ? Number(form.parking) > 0 : false,
        elevator: form.elevator,
        balcony: form.balcony,
        ac: form.ac,
        air_conditioning: form.ac,
        shelter: form.shelter,
        mamad: form.shelter,
        solar: form.solar,
        solar_heater: form.solar,
        photos: form.photos,
        images: form.photos,
        source_url: form.source_url || null,
      };
      const baseFeatures = Array.isArray(data?.row?.features)
        ? (data.row.features as unknown[]).filter((f): f is string => typeof f === 'string' && !['מרפסת', 'מעלית', 'מיזוג', 'ממ"ד', 'מקלט', 'דוד שמש'].includes(f))
        : [];
      const featureLabels = [
        form.balcony ? 'מרפסת' : null,
        form.elevator ? 'מעלית' : null,
        form.ac ? 'מיזוג' : null,
        form.shelter ? 'ממ"ד' : null,
        form.solar ? 'דוד שמש' : null,
      ].filter((v): v is string => !!v);
      const { error } = await supabase.from('listings').update({
        property_title: form.title || null,
        city: form.city || null,
        neighborhood: form.neighborhood || null,
        address: form.address || null,
        rooms: form.rooms ? Number(form.rooms) : null,
        sqm: form.sqm ? Number(form.sqm) : null,
        floor: form.floor ? Number(form.floor) : null,
        parking: form.parking ? Number(form.parking) > 0 : false,
        elevator: form.elevator,
        asking_price: form.price ? Number(form.price) : 0,
        description: form.description || null,
        source_url: form.source_url || null,
        media_photos: form.photos,
        features: Array.from(new Set([...baseFeatures, ...featureLabels])) as never,
        source_metadata: newMeta as never,
      }).eq('id', id);
      if (error) throw error;
      toast.success('הנכס עודכן בהצלחה');
      clearDraft();
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
        <h1 className="text-3xl font-bold tracking-tight text-primary">הנכס לא נמצא</h1>
        <p className="text-muted-foreground">ייתכן שהקישור פג תוקף או שהנכס הוסר מהקטלוג.</p>
        <Button onClick={() => navigate('/properties')} variant="outline" className="gap-2">
          <ArrowRight className="h-4 w-4" /> חזרה לקטלוג
        </Button>
      </div>
    );
  }

  const isRent = property.price < 50_000;
  // Hard-override: render straight from listing.media_photos (dbPhotos). No filtering,
  // no "broken" gating, no live-image fallback. If the DB has photos, they render.
  const photos = editMode && form ? form.photos : dbPhotos;
  const main = photos[activePhoto];
  // Total images the SOURCE page advertises — shown even before mirroring.
  const totalSourcePhotos = sourcePhotoCount(
    { raw: { source_metadata: meta, ...(property ?? {}) } },
    photos.length,
  );

  // Prefer the raw source-provided property type verbatim (e.g. "דירה" from
  // Webtiv/Homely). Only fall back to the enum-derived Hebrew label when the
  // source didn't supply anything. NEVER guess from title/description.
  const rawPropertyTypeSource = String(
    ((property as any).features && typeof (property as any).features === 'object' && !Array.isArray((property as any).features)
      ? (property as any).features.property_type
      : null)
    ?? (property as any).property_type_source
    ?? ''
  ).trim();
  const propertyTypeHe = rawPropertyTypeSource || PROPERTY_TYPE_LABELS_HE[property.property_type] || 'דירה';
  const transactionHe = isRent ? 'להשכרה' : 'למכירה';
  // Internal workspace headline keeps full operational address details.
  const dynamicHeadline = formatInternalListingTitle({
    address: property.address,
    city: property.city,
    neighborhood,
    property_type: property.property_type,
    title: property.title,
    raw: data?.row,
  }) || `${propertyTypeHe} ${transactionHe}`;

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
  const setBoolField = (k: keyof EditableFields, v: boolean) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));
  const setPhotos = (updater: (photos: string[]) => string[]) =>
    setForm((f) => {
      if (!f) return f;
      const nextPhotos = normalizeImageUrls(updater(f.photos));
      setActivePhoto((current) => Math.max(0, Math.min(current, Math.max(nextPhotos.length - 1, 0))));
      return { ...f, photos: nextPhotos };
    });

  const removeBrokenPhoto = (url: string) => {
    if (editMode) setPhotos((list) => list.filter((item) => item !== url));
  };

  /** Manual on-demand pull of the FULL gallery from the original source. */
  const pullAllImages = async () => {
    if (!property?.id || pullingImages) return;
    setPullingImages(true);
    setImageProgress(5);
    const toastId = toast.loading('טוען את כל התמונות מהמקור…');
    try {
      const { data, error } = await supabase.functions.invoke('fetch-property-all-images', {
        body: { listing_id: property.id, source_url: sourceUrl || undefined },
      });
      if (error) throw error;
      const res = data as { ok?: boolean; count?: number; photos?: string[]; reason?: string } | null;
      if (!res?.ok) {
        toast.error('לא נמצאו תמונות נוספות', { id: toastId, description: res?.reason ?? undefined });
        return;
      }
      setActivePhoto(0);
      await qc.refetchQueries({ queryKey: ['property-detail', id] });
      qc.invalidateQueries({ queryKey: ['properties-search'] });
      qc.invalidateQueries({ queryKey: ['listings'] });
    } catch (e: any) {
      toast.error('טעינת התמונות נכשלה', { description: e?.message ?? String(e) });
    } finally {
      setImageProgress(100);
      setTimeout(() => setPullingImages(false), 250);
    }
  };

  /**
   * Carousel navigation — the ONLY entry point for image loading.
   * Nothing is fetched when the page opens; the first arrow click pulls the
   * full gallery from the source (ring loader over the main image), and later
   * clicks just move between the already-loaded photos.
   */
  const stepPhoto = async (delta: number) => {
    if (pullingImages || hydrating) return;
    if (!galleryPulledRef.current && sourceUrl) {
      galleryPulledRef.current = true;
      await pullAllImages();
      return;
    }
    if (photos.length <= 1) return;
    setActivePhoto((i) => (i + delta + photos.length) % photos.length);
  };






  const mirrorExternalUrl = async (rawUrl: string): Promise<string | null> => {
    const url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) return null;
    try {
      const { data, error } = await supabase.functions.invoke('mirror-external-image', {
        body: { url },
      });
      if (error) throw error;
      const mirrored = (data as { public_url?: string } | null)?.public_url;
      if (mirrored) return mirrored;
    } catch (e: any) {
      console.warn('mirror-external-image failed', e?.message ?? e);
    }
    return null;
  };

  const addPhotoUrl = async () => {
    if (!form?.photo_url_draft.trim()) return;
    const raw = form.photo_url_draft.trim();
    setField('photo_url_draft', '');
    setUploadingPhoto(true);
    try {
      const mirrored = await mirrorExternalUrl(raw);
      const finalUrl = mirrored || raw;
      setPhotos((photos) => Array.from(new Set([...photos, finalUrl])));
      if (mirrored) toast.success('התמונה שוכפלה למאגר');
      else toast.message('לא ניתן היה לשכפל — הקישור נוסף כפי שהוא');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files?.length || !id) return;
    setUploadingPhoto(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error('יש להתחבר כדי להעלות תמונות');
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const row = await uploadMediaToLibrary({
          userId,
          fileName: file.name,
          data: file,
          mimeType: file.type,
          source: 'property',
          sourceMetadata: { listing_id: id },
        });
        const url = (row as any)?.public_url;
        if (typeof url === 'string' && url) uploaded.push(url);
      }
      if (uploaded.length) {
        setPhotos((photos) => Array.from(new Set([...photos, ...uploaded])));
        toast.success(`${uploaded.length} תמונות נוספו`);
      }
    } catch (e: any) {
      toast.error(`העלאת תמונה נכשלה: ${e.message ?? e}`);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handlePhotoDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const dt = e.dataTransfer;
    if (!dt) return;
    // 1. Files dropped from OS
    if (dt.files && dt.files.length > 0) {
      const images = Array.from(dt.files).filter((f) => f.type.startsWith('image/'));
      if (images.length) {
        const list = new DataTransfer();
        images.forEach((f) => list.items.add(f));
        await handlePhotoUpload(list.files);
        return;
      }
    }
    // 2. External image (URLs from browsers)
    const uriList = dt.getData('text/uri-list');
    const html = dt.getData('text/html');
    const plain = dt.getData('text/plain');
    const urls = new Set<string>();
    if (uriList) uriList.split(/\r?\n/).forEach((u) => u && !u.startsWith('#') && urls.add(u.trim()));
    if (html) {
      const matches = html.match(/https?:\/\/[^\s"'<>]+/gi) || [];
      matches.forEach((u) => urls.add(u));
    }
    if (plain && /^https?:\/\//i.test(plain.trim())) urls.add(plain.trim());
    if (urls.size === 0) return;
    setUploadingPhoto(true);
    try {
      const added: string[] = [];
      for (const u of urls) {
        const mirrored = await mirrorExternalUrl(u);
        if (mirrored) added.push(mirrored);
      }
      if (added.length) {
        setPhotos((photos) => Array.from(new Set([...photos, ...added])));
        toast.success(`${added.length} תמונות יובאו`);
      } else {
        toast.error('שכפול התמונה מהאתר החיצוני נכשל');
      }
    } finally {
      setUploadingPhoto(false);
    }
  };


  const resolvedSourceUrl =
    sourceUrl ||
    (typeof (meta as JsonRecord).source_url === 'string' ? (meta as JsonRecord).source_url as string : '') ||
    '';
  const sourceOrigin = String((meta as JsonRecord).source_origin ?? '').toLowerCase();
  const isYad2Listing = sourceOrigin === 'yad2' || /yad2\.co\.il/i.test(resolvedSourceUrl);
  const yad2Url = isYad2Listing ? resolvedSourceUrl : '';

  return (
    <div className="p-3 sm:p-6 space-y-6" dir="rtl">
      {/* First-view metadata hydration: percentage-only ring, floating dead
          center of the viewport. No scrim, no blur, no scroll lock. */}
      {hydrating && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className="pointer-events-none rounded-full bg-background/90 p-2 shadow-lg">
            <ProgressRing value={hydrateProgress} size={96} strokeWidth={8} />
          </div>
        </div>
      )}


      {/* Headline · neighborhood · price · actions row */}
      <header className="space-y-2">
        <div>
          <div
            role="heading"
            aria-level={1}
            className="text-3xl font-bold text-right text-slate-900 block leading-snug"
          >
            {dynamicHeadline}
          </div>
          {/* Neighborhood sits directly under the title, above the price. */}
          {neighborhood && (
            <div className="mt-1 text-lg font-medium text-slate-600">{neighborhood}</div>
          )}
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-3 flex-wrap pt-1">
          {editMode && form ? (
            <Input
              type="number"
              value={form.price}
              onChange={(e) => setField('price', e.target.value)}
              className="max-w-xs"
              placeholder="מחיר"
            />
          ) : property.price > 0 ? (
            <>
              {/* 48px → 38px per workspace spec */}
              <span className="text-[38px] leading-none font-extrabold text-success tabular-nums">
                {formatPrice(property.price)}
                {isRent && <span className="text-xl font-normal text-muted-foreground"> /חודש</span>}
              </span>
              {pricePerMeter ? (
                <span className="text-lg text-muted-foreground font-normal">
                  ({pricePerMeter} ₪ למ"ר)
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-3xl font-semibold text-amber-600">פרטים חסרים · Draft</span>
          )}
        </div>

        {/* Owner (visual right, RTL start) + action buttons (visual left) */}
        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
          {data?.owner ? (
            <Link
              to={`/crm/profile/${data.owner.id}`}
              className="text-[16px] font-semibold text-primary hover:underline"
              title="פתיחת כרטיס הלקוח"
            >
              {data.owner.full_name}
            </Link>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-3">

            {!editMode ? (
              <>


                {/* Yad2 live ad first, campaign second (positions swapped). */}
                {yad2Url && (
                  <a
                    href={yad2Url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="צפייה במודעה החיה ביד2"
                    title="צפייה במודעה החיה ביד2"
                    className="inline-flex items-center transition-opacity hover:opacity-80"
                  >
                    <Yad2Icon className="h-6 w-6" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => navigate(`/campaigns?tab=create&channel=facebook&properties=${property.id}&listing=${property.id}`)}
                  aria-label="צור פוסט לנכס"
                  title="צור פוסט לנכס"
                  className="text-slate-500 hover:text-primary transition-colors bg-transparent border-0 p-0"
                >
                  <Send className="h-5 w-5" />
                </button>
                <PropertyShareMenu
                  results={[{
                    key: property.id,
                    localId: property.id,
                    source: 'mine',
                    title: property.title ?? null,
                    address: property.address ?? null,
                    city: property.city ?? null,
                    price: typeof property.price === 'number' ? property.price : null,
                    rooms: (property as any).rooms ?? null,
                    size_sqm: (property as any).sqm ?? null,
                    property_type: (property as any).property_type ?? null,
                    listing_type: Number(property.price) < 50_000 ? 'rent' : 'sale',
                    photos: photos ?? [],
                  } as any]}
                  iconOnly
                  variant="ghost"
                />
                <button
                  type="button"
                  onClick={() => setEditMode(true)}
                  aria-label="עריכת נכס"
                  title="עריכת נכס"
                  className="text-slate-500 hover:text-primary transition-colors bg-transparent border-0 p-0"
                >
                  <Pencil className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!property?.id) return;
                    const ok = window.confirm('למחוק את הנכס לצמיתות מהמאגר?');
                    if (!ok) return;
                    const { data, error } = await supabase
                      .from('listings')
                      .delete()
                      .eq('id', property.id)
                      .select('id');
                    if (error) {
                      toast.error('מחיקת הנכס נכשלה', { description: error.message });
                      return;
                    }
                    if (!data || data.length === 0) {
                      toast.error('מחיקת הנכס נכשלה', {
                        description: 'אין הרשאה למחוק את הנכס הזה (הבעלים אינו המשתמש הנוכחי).',
                      });
                      return;
                    }
                    toast.success('הנכס נמחק');
                    qc.invalidateQueries({ queryKey: ['listings'] });
                    qc.invalidateQueries({ queryKey: ['properties-search'] });
                    navigate('/properties');
                  }}
                  aria-label="מחיקת נכס"
                  title="מחיקת נכס"
                  className="text-slate-500 hover:text-destructive transition-colors bg-transparent border-0 p-0"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={requestExitEditMode}
                  disabled={saving}
                  aria-label="ביטול"
                  title="ביטול"
                  className="text-slate-500 hover:text-destructive transition-colors bg-transparent border-0 p-0"
                >
                  <X className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  aria-label="שמירה"
                  title="שמירה"
                  className="text-primary hover:opacity-80 transition-opacity bg-transparent border-0 p-0"
                >
                  <Save className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
        </div>

      </header>

      {/* Gallery + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {(main || editMode) && (
            <Card className="overflow-hidden">
              <div className="aspect-[16/10] bg-muted relative">
                {main ? (
                  <img src={main} alt={dynamicHeadline} className="h-full w-full object-cover" />
                ) : (meta as any)?.media_status === 'images_unavailable' ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
                    <ImageIcon className="h-10 w-10" />
                    <div className="text-xl font-medium text-foreground">תמונות לא זמינות עבור נכס זה</div>
                    <div className="text-lg">צרו קשר עם הסוכן לפרטים נוספים ולתמונות מלאות</div>
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-10 w-10" />
                  </div>
                )}

                {!editMode && (
                  <>
                    <button
                      type="button"
                      onClick={() => stepPhoto(-1)}
                      disabled={hydrating || pullingImages}
                      aria-label="התמונה הקודמת"
                      title="התמונה הקודמת"
                      className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-background/80 text-foreground shadow hover:bg-background disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => stepPhoto(1)}
                      disabled={hydrating || pullingImages}
                      aria-label="התמונה הבאה"
                      title="התמונה הבאה"
                      className="absolute left-2 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-background/80 text-foreground shadow hover:bg-background disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>

                    {/* Total images available on the SOURCE page, even if not imported yet. */}
                    {totalSourcePhotos > 0 && (
                      <span className="absolute top-2 right-2 rounded-full bg-black/70 px-2.5 py-1 text-xs font-bold leading-none text-white tabular-nums">
                        {photos.length > 0 ? `${activePhoto + 1}/${totalSourcePhotos}` : totalSourcePhotos}
                      </span>
                    )}

                    {/* Percentage-only ring loader, dead center, while images load. */}
                    {pullingImages && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                        <ProgressRing value={imageProgress} size={80} onDark />
                      </span>
                    )}
                  </>
                )}
              </div>

            </Card>
          )}
          {(photos.length > 1 || editMode) && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {photos.map((p, i) => (
                <button
                  key={`${p}-${i}`}
                  type="button"
                  onClick={() => setActivePhoto(i)}
                  className={`relative h-20 w-32 shrink-0 overflow-hidden rounded-md border-2 transition-all ${
                    i === activePhoto ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={p} alt="" className="h-full w-full object-cover" />
                  {editMode && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); setPhotos((list) => list.filter((_, index) => index !== i)); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setPhotos((list) => list.filter((_, index) => index !== i)); } }}
                      className="absolute left-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-destructive shadow"
                      aria-label="מחק תמונה"
                      title="מחק תמונה"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {editMode && form && (
            <Card className="p-4 sm:p-5 space-y-3">
              <h2 className="text-2xl font-bold text-primary">תמונות הנכס</h2>
              <div
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={handlePhotoDrop}
                className="rounded-md border-2 border-dashed border-primary/30 bg-primary/5 p-3 flex items-center gap-2"
              >
                <label
                  className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                  aria-label="העלה קבצי תמונה"
                  title="העלה קבצי תמונה"
                >
                  <Upload className={`h-4 w-4 ${uploadingPhoto ? 'animate-pulse' : ''}`} />
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(e) => handlePhotoUpload(e.target.files)}
                    disabled={uploadingPhoto}
                  />
                </label>
                <div className="relative flex-1">
                  <Input
                    value={form.photo_url_draft}
                    onChange={(e) => setField('photo_url_draft', e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPhotoUrl(); } }}
                    placeholder="הדבקת קישור לתמונה או גרירה מדפדפן"
                    className="text-right pl-10"
                  />
                  <button
                    type="button"
                    onClick={addPhotoUrl}
                    disabled={!form.photo_url_draft.trim() || uploadingPhoto}
                    aria-label="הוסף קישור לתמונה"
                    title="הוסף קישור לתמונה"
                    className="absolute left-1 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-md text-primary hover:bg-primary/10 disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          )}


          {/* Specs grid — edit mode only */}
          {editMode && form && (
          <Card className="p-4 sm:p-5">
            <h2 className="text-[19px] font-bold text-primary mb-4">מאפייני הנכס</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label="כותרת"><Input value={form.title} onChange={(e) => setField('title', e.target.value)} /></Field>
                <Field label="חדרים"><Input type="number" step="0.5" value={form.rooms} onChange={(e) => setField('rooms', e.target.value)} /></Field>
                <Field label='שטח (מ"ר)'><Input type="number" value={form.sqm} onChange={(e) => setField('sqm', e.target.value)} /></Field>
                <Field label="קומה"><Input type="number" value={form.floor} onChange={(e) => setField('floor', e.target.value)} /></Field>
                <Field label='סה"כ קומות'><Input type="number" value={form.total_floors} onChange={(e) => setField('total_floors', e.target.value)} /></Field>
                <Field label="שנת בנייה"><Input type="number" value={form.year_built} onChange={(e) => setField('year_built', e.target.value)} /></Field>
                <Field label="סוג נכס">
                  <select
                    value={form.property_type}
                    onChange={(e) => setField('property_type', e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-xl"
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
                <Field label="חניות"><Input type="number" min={0} value={form.parking} onChange={(e) => setField('parking', e.target.value)} /></Field>
                <Field label="קישור מקור / יד2"><Input value={form.source_url} onChange={(e) => setField('source_url', e.target.value)} dir="ltr" className="text-left" /></Field>
                <div className="col-span-2 sm:col-span-3 grid grid-cols-2 sm:grid-cols-3 gap-2 border-t pt-3">
                  {([
                    ['מעלית', 'elevator'],
                    ['מרפסת', 'balcony'],
                    ['מיזוג', 'ac'],
                    ['ממ"ד / מקלט', 'shelter'],
                    ['דוד שמש', 'solar'],
                  ] as const).map(([label, key]) => (
                    <label key={key} className="flex items-center gap-2 rounded-md border px-3 py-2 text-xl cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(form[key])}
                        onChange={(e) => setBoolField(key, e.target.checked)}
                        className="h-4 w-4 accent-primary"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
          </Card>
          )}


          {/* Description — editable text only (no heading in view mode) */}
          {editMode && form && (
            <Card className="p-4 sm:p-5">
              <Textarea
                dir="rtl"
                rows={8}
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
              />
            </Card>
          )}

          {!editMode && documents.length > 0 && (
            <Card className="p-4 sm:p-5">
              <h2 className="text-2xl font-bold text-primary mb-3">מסמכים</h2>
              <ul className="space-y-2">
                {documents.map((d, i) => (
                  <li key={`${d.url}-${i}`} className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 hover:bg-muted/40">
                    <span className="text-xl text-foreground truncate">{d.name}</span>
                    <div className="flex items-center gap-2">
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-lg font-semibold text-primary hover:underline"
                      >
                        צפה
                      </a>
                      <a
                        href={d.url}
                        download
                        className="text-lg font-semibold text-primary hover:underline"
                      >
                        הורד
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {!editMode && financialEntries.length > 0 && (
            <Card className="p-4 sm:p-5">
              <h2 className="text-2xl font-bold text-primary mb-3 inline-flex items-center gap-2">
                <Receipt className="h-4 w-4" /> פרטים פיננסיים
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {financialEntries.map(([k, v]) => (
                  <Spec key={k} icon={Receipt} label={META_LABELS[k] || k} value={formatMetaValue(k, v)} />
                ))}
              </div>
            </Card>
          )}

          {!editMode && data?.rich && (
            <PropertyRichDetailsCard
              aboutText={data.rich.about}
              aboutBlocks={data.rich.aboutBlocks}
              furniture={data.rich.furniture}
              additional={data.rich.additional}
              amenities={data.rich.amenities}
              priceHistory={data.rich.priceHistory}
              latitude={data.rich.latitude}
              longitude={data.rich.longitude}
              addressLabel={[property.address, property.city].filter(Boolean).join(', ')}
            />
          )}

          {!editMode && (
            <AreaMarketFactsCard
              city={property.city}
              neighborhood={neighborhood || null}
              dealType={Number(property.price) < 50_000 ? 'rent' : 'sale'}
              listingId={property.id}
            />
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
              <h2 className="text-xl font-bold text-muted-foreground uppercase tracking-wider mb-4">הסוכן המטפל</h2>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-14 w-14 rounded-full bg-primary/10 grid place-items-center text-primary font-bold text-2xl">
                  {property.agent.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-foreground truncate">{property.agent.name}</p>
                  {property.agent.agency && (
                    <p className="text-lg text-muted-foreground truncate">{property.agent.agency}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <a href={`tel:${property.agent.phone}`} className="flex items-center gap-2 text-xl text-foreground hover:text-primary transition-colors">
                  <Phone className="h-4 w-4 text-primary" /> {property.agent.phone}
                </a>
                <a href={`mailto:${property.agent.email}`} className="flex items-center gap-2 text-xl text-foreground hover:text-primary transition-colors">
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
      <Icon className="h-[18px] w-[18px] text-primary mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[17px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-[20px] font-semibold text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[22px] text-muted-foreground uppercase tracking-wide block">{label}</label>
      {children}
    </div>
  );
}
