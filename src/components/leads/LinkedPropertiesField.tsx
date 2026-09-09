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
}

export function propertyLabel(p: PropertyOption) {
  const parts = [p.property_title, p.address, p.city].filter(Boolean) as string[];
  return parts.join(' · ') || 'נכס ללא כותרת';
}

/** Every property available to the signed-in user's workspace. */
export function useWorkspaceProperties() {
  return useQuery({
    queryKey: ['linkable-listings'],
    queryFn: async (): Promise<PropertyOption[]> => {
      const { data, error } = await supabase
        .from('listings')
        .select('id, property_title, address, city, deal_type, asking_price')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as PropertyOption[];
    },
    staleTime: 5 * 60 * 1000,
  });
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
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <Badge key={id} variant="secondary" className="gap-1 text-xs max-w-full">
              <span className="truncate">{byId.has(id) ? propertyLabel(byId.get(id)!) : 'נכס'}</span>
              <button type="button" onClick={() => toggle(id)} aria-label="הסר נכס">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
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
          <div className="max-h-52 overflow-y-auto space-y-1">
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
                  {on ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                  <span className="truncate">{propertyLabel(p)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
