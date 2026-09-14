import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Building2, Check, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export interface PropertyOption {
  id: string;
  property_title: string | null;
  address: string | null;
  city: string | null;
  deal_type: string | null;
  asking_price: number | null;
  rooms?: number | null;
  image_url?: string | null;
  media_photos?: unknown;
  house_number?: string | number | null;
  apartment_number?: string | number | null;
}

export function propertyLabel(p: PropertyOption) {
  const parts = [p.property_title, p.address, p.city].filter(Boolean) as string[];
  return parts.join(' · ') || 'נכס ללא כותרת';
}

/**
 * Internal display address: street name + house number + apartment number when
 * the record has them, then the city. Workspace-only — public pages keep using
 * stripAddressNumbers.
 */
export function propertyFullAddress(p: PropertyOption) {
  let line = String(p.address ?? '').replace(/\s+/g, ' ').trim();
  const house = p.house_number != null ? String(p.house_number).trim() : '';
  const apt = p.apartment_number != null ? String(p.apartment_number).trim() : '';
  if (house && !new RegExp(`(^|[\\s,])${house.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s,]|$)`).test(line)) {
    line = line ? `${line} ${house}` : house;
  }
  if (apt && !/(דירה|יח["׳']|apt|unit)/i.test(line)) {
    line = line ? `${line}, דירה ${apt}` : `דירה ${apt}`;
  }
  const parts = [line, p.city].filter(Boolean) as string[];
  return parts.join(', ') || p.property_title || 'כתובת לא הוזנה';
}

/** "מכירה" / "השכרה". */
export function propertyDealLabel(p: PropertyOption): string | null {
  if (p.deal_type === 'rent') return 'השכרה';
  if (p.deal_type === 'sale') return 'מכירה';
  return null;
}

/** 8000 -> "8,000 ₪". */
export function propertyPriceLabel(p: PropertyOption): string | null {
  const n = Number(p.asking_price);
  if (!p.asking_price || Number.isNaN(n)) return null;
  return `${n.toLocaleString('he-IL', { maximumFractionDigits: 0 })} ₪`;
}

export function propertyRoomsLabel(p: PropertyOption): string | null {
  const n = Number(p.rooms);
  if (!p.rooms || Number.isNaN(n)) return null;
  return `${n % 1 === 0 ? n : n.toFixed(1)} חדרים`;
}

/** First usable photo: explicit image, otherwise the first gallery photo. */
export function propertyImage(p: PropertyOption): string | null {
  if (p.image_url) return p.image_url;
  const photos = p.media_photos;
  if (Array.isArray(photos)) {
    const first = photos.find((x) => typeof x === 'string' && x.startsWith('http'));
    if (first) return first as string;
  }
  return null;
}

const LISTING_FIELDS = 'id, property_title, address, city, deal_type, asking_price, rooms, image_url, media_photos, house_number, apartment_number';

/** Every property available to the signed-in user's workspace. */
export function useWorkspaceProperties() {
  return useQuery({
    queryKey: ['linkable-listings'],
    queryFn: async (): Promise<PropertyOption[]> => {
      const { data, error } = await supabase
        .from('listings')
        .select(LISTING_FIELDS)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as PropertyOption[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Details row shared by the dropdown and the linked-property cards. */
export function PropertyMeta({ p }: { p: PropertyOption }) {
  const bits = [propertyDealLabel(p), propertyPriceLabel(p), propertyRoomsLabel(p)].filter(Boolean) as string[];
  if (!bits.length) return null;
  return (
    <p className="text-[13px] text-muted-foreground truncate">{bits.join(' · ')}</p>
  );
}

/** Square thumbnail with a neutral placeholder when the listing has no photo. */
export function PropertyThumb({ p, size = 44 }: { p: PropertyOption; size?: number }) {
  const src = propertyImage(p);
  return (
    <div
      className="shrink-0 rounded-md overflow-hidden bg-slate-100 grid place-items-center"
      style={{ width: size, height: size }}
    >
      {src ? (
        <img
          src={src}
          alt={propertyFullAddress(p)}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <Building2 className="h-4 w-4 text-slate-400" />
      )}
    </div>
  );
}

/** Properties already linked to a contact. */
export function useLinkedProperties(leadId?: string | null) {
  return useQuery({
    queryKey: ['lead-listings', leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('lead_listings')
        .select('listing_id')
        .eq('lead_id', leadId!);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.listing_id as string);
    },
    staleTime: 60 * 1000,
  });
}

/** Persist the full set of links for a contact (used after contact creation too). */
export async function saveLeadPropertyLinks(leadId: string, listingIds: string[]) {
  const { data: existing } = await supabase
    .from('lead_listings')
    .select('id, listing_id')
    .eq('lead_id', leadId);
  const current = new Set((existing ?? []).map((r: any) => r.listing_id as string));
  const next = new Set(listingIds);
  const toAdd = listingIds.filter((id) => !current.has(id));
  const toRemove = (existing ?? []).filter((r: any) => !next.has(r.listing_id));
  if (toAdd.length) {
    await supabase
      .from('lead_listings')
      .insert(toAdd.map((listing_id) => ({ lead_id: leadId, listing_id })) as any);
  }
  if (toRemove.length) {
    await supabase
      .from('lead_listings')
      .delete()
      .in('id', toRemove.map((r: any) => r.id));
  }
}

interface Props {
  /** When present, changes are written to the database immediately. */
  leadId?: string | null;
  /** Controlled selection, used while creating a new contact. */
  value?: string[];
  onChange?: (ids: string[]) => void;
  label?: string;
}

/**
 * Multi-select field linking one or many properties to a contact. Works both in
 * the create dialog (controlled, saved after the contact exists) and in the CRM
 * profile sheet (writes straight to the link table).
 */
export default function LinkedPropertiesField({ leadId, value, onChange, label = 'נכסים מקושרים' }: Props) {
  const queryClient = useQueryClient();
  const { data: properties = [], isLoading } = useWorkspaceProperties();
  const { data: linked = [] } = useLinkedProperties(leadId);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');

  const selected = leadId ? linked : (value ?? []);

  const byId = useMemo(() => {
    const m = new Map<string, PropertyOption>();
    properties.forEach((p) => m.set(p.id, p));
    return m;
  }, [properties]);

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return properties.slice(0, 40);
    return properties
      .filter((p) => propertyLabel(p).toLowerCase().includes(t))
      .slice(0, 40);
  }, [properties, term]);

  const commit = async (ids: string[]) => {
    if (!leadId) {
      onChange?.(ids);
      return;
    }
    try {
      await saveLeadPropertyLinks(leadId, ids);
      queryClient.invalidateQueries({ queryKey: ['lead-listings', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads-infinite'] });
      toast.success('הנכסים המקושרים עודכנו');
    } catch (e: any) {
      toast.error('עדכון הנכסים נכשל', { description: e?.message });
    }
  };

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    commit(next);
  };

  return (
    <div className="space-y-2" dir="rtl">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5 text-slate-700" />
          {label}
        </p>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen((o) => !o)}>
          <Plus className="h-3.5 w-3.5 ms-1" />
          {open ? 'סגור' : 'קשר נכס'}
        </Button>
      </div>

      {selected.length > 0 && (
        <div className="space-y-1.5">
          {selected.map((id) => {
            const p = byId.get(id);
            if (!p) {
              return (
                <Badge key={id} variant="secondary" className="gap-1 text-xs max-w-full">
                  <span className="truncate">נכס</span>
                  <button type="button" onClick={() => toggle(id)} aria-label="הסר נכס">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            }
            return (
              <div
                key={id}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2"
              >
                <PropertyThumb p={p} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">{propertyFullAddress(p)}</p>
                  {p.property_title && (
                    <p className="text-[13px] text-slate-500 truncate">{p.property_title}</p>
                  )}
                  <PropertyMeta p={p} />
                </div>
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  aria-label="הסר נכס"
                  className="shrink-0 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <div className="rounded-lg border border-slate-200 bg-white p-2 space-y-2">
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="חיפוש נכס לפי כותרת, כתובת או עיר"
            className="h-8 text-sm"
          />
          <div className="max-h-64 overflow-y-auto space-y-1">
            {isLoading && <p className="text-xs text-muted-foreground p-2">טוען נכסים…</p>}
            {!isLoading && filtered.length === 0 && (
              <p className="text-xs text-muted-foreground p-2">לא נמצאו נכסים במאגר.</p>
            )}
            {filtered.map((p) => {
              const on = selected.includes(p.id);
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className={`w-full text-right text-xs p-2 rounded-md flex items-center gap-2 ${on ? 'bg-emerald-50 text-emerald-900' : 'hover:bg-slate-50'}`}
                >
                  <PropertyThumb p={p} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{propertyFullAddress(p)}</span>
                    {p.property_title && (
                      <span className="block truncate text-[11px] text-slate-500">{p.property_title}</span>
                    )}
                    <PropertyMeta p={p} />
                  </span>
                  {on && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
