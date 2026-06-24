/**
 * OwnerPropertyGrid
 * -----------------
 * Renders the 13 Homely-style property fields for an OWNER lead
 * (seller / landlord). The grid is backed by a one-to-one row in
 * the `listings` table, linked through `leads.linked_listing_id`.
 *
 * - If no listing is linked yet, the first edit auto-creates one
 *   and links it to the lead.
 * - Field labels are Hebrew and mirror the Homely column structure:
 *   סידורי, סוכן, נכס, חדרים, מחיר, עיר, אזור, רחוב, מס׳, קומה,
 *   מעלית, פתיחה, עדכון.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

type Lead = { id: string; full_name: string | null; linked_listing_id?: string | null; user_id?: string | null };

const PROPERTY_TYPE_OPTS = [
  { v: 'apartment', l: 'דירה' },
  { v: 'penthouse', l: 'פנטהאוז' },
  { v: 'cottage', l: "קוטג'" },
  { v: 'house', l: 'בית פרטי' },
  { v: 'studio', l: 'סטודיו' },
  { v: 'duplex', l: 'דופלקס' },
  { v: 'office', l: 'משרד' },
  { v: 'commercial', l: 'מסחרי' },
  { v: 'land', l: 'קרקע' },
];

export default function OwnerPropertyGrid({ lead }: { lead: Lead & Record<string, any> }) {
  const qc = useQueryClient();
  const linkedId: string | null = lead.linked_listing_id ?? null;

  const { data: listing, isLoading } = useQuery({
    queryKey: ['owner-listing', lead.id, linkedId],
    enabled: !!linkedId,
    queryFn: async () => {
      if (!linkedId) return null;
      const { data, error } = await supabase.from('listings').select('*').eq('id', linkedId).maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });

  // local edit buffer for snappy typing without per-keystroke saves
  const [buf, setBuf] = useState<Record<string, string>>({});
  useEffect(() => { setBuf({}); }, [linkedId]);

  const v = (k: string, fallback?: any) =>
    buf[k] !== undefined ? buf[k] : (listing?.[k as keyof typeof listing] as any) ?? fallback ?? '';

  async function ensureListingAndPatch(patch: Record<string, any>) {
    try {
      let id = linkedId;
      if (!id) {
        const { data: userRes } = await supabase.auth.getUser();
        const uid = userRes?.user?.id;
        if (!uid) throw new Error('not authenticated');
        const slug = `owner-${lead.id.slice(0, 8)}-${Date.now()}`;
        const { data: created, error: insErr } = await supabase
          .from('listings')
          .insert({
            user_id: uid,
            slug,
            property_title: lead.full_name ? `נכס של ${lead.full_name}` : 'נכס בעלים',
            status: 'pending',
            source: 'owner_lead',
            extracted_from_lead_id: lead.id,
            ...patch,
          } as any)
          .select('id')
          .single();
        if (insErr) throw insErr;
        id = created.id;
        const { error: linkErr } = await supabase
          .from('leads').update({ linked_listing_id: id } as any).eq('id', lead.id);
        if (linkErr) throw linkErr;
      } else {
        const { error: upErr } = await supabase.from('listings').update(patch as any).eq('id', id);
        if (upErr) throw upErr;
      }
      toast.success('הנכס עודכן');
      qc.invalidateQueries({ queryKey: ['owner-listing', lead.id] });
      qc.invalidateQueries({ queryKey: ['leads-infinite'] });
    } catch (err: any) {
      toast.error('שמירת נתוני הנכס נכשלה', { description: err?.message });
    }
  }

  const commit = (k: string, raw: string, asNumber = false) => {
    const val = raw.trim() === '' ? null : (asNumber ? Number(raw) : raw);
    ensureListingAndPatch({ [k]: val });
    setBuf((b) => { const n = { ...b }; delete n[k]; return n; });
  };

  const Cell = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="p-2.5 rounded-md bg-white border border-slate-200 space-y-1">
      <p className="text-[11px] font-semibold text-slate-600">{label}</p>
      {children}
    </div>
  );

  if (linkedId && isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> טוען נתוני נכס…
      </div>
    );
  }

  const extId = (listing as any)?.external_id ?? '';
  const meta = ((listing as any)?.source_metadata ?? {}) as Record<string, any>;
  const opening = (listing as any)?.created_at;
  const updated = (listing as any)?.updated_at;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
        <Building2 className="h-3.5 w-3.5 text-primary" />
        פרטי הנכס (בעלים)
        {!linkedId && <span className="font-normal text-muted-foreground">— יווצר אוטומטית בעריכה ראשונה</span>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <Cell label="סידורי">
          <Input value={String(v('external_id') || extId || '')}
            onChange={(e) => setBuf((b) => ({ ...b, external_id: e.target.value }))}
            onBlur={(e) => commit('external_id', e.target.value)}
            placeholder="—" className="h-7 text-sm" />
        </Cell>
        <Cell label="סוכן אחראי">
          <Input value={String(meta.agent ?? buf.__agent ?? '')}
            onChange={(e) => setBuf((b) => ({ ...b, __agent: e.target.value }))}
            onBlur={(e) => {
              const next = { ...meta, agent: e.target.value || null };
              ensureListingAndPatch({ source_metadata: next });
              setBuf((b) => { const n = { ...b }; delete n.__agent; return n; });
            }}
            placeholder="—" className="h-7 text-sm" />
        </Cell>
        <Cell label="סוג נכס">
          <Select value={(v('features')?.property_type) || meta.property_type || ''}
            onValueChange={(val) => {
              const features = { ...(listing as any)?.features, property_type: val };
              ensureListingAndPatch({ features });
            }}>
            <SelectTrigger className="h-7 text-sm"><SelectValue placeholder="בחר" /></SelectTrigger>
            <SelectContent>
              {PROPERTY_TYPE_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
            </SelectContent>
          </Select>
        </Cell>
        <Cell label="חדרים">
          <Input type="number" step="0.5" value={String(v('rooms') ?? '')}
            onChange={(e) => setBuf((b) => ({ ...b, rooms: e.target.value }))}
            onBlur={(e) => commit('rooms', e.target.value, true)}
            placeholder="—" className="h-7 text-sm" />
        </Cell>
        <Cell label="מחיר (₪)">
          <Input type="number" value={String(v('asking_price') ?? '')}
            onChange={(e) => setBuf((b) => ({ ...b, asking_price: e.target.value }))}
            onBlur={(e) => commit('asking_price', e.target.value, true)}
            placeholder="—" className="h-7 text-sm" />
        </Cell>
        <Cell label="עיר">
          <Input value={String(v('city') ?? '')}
            onChange={(e) => setBuf((b) => ({ ...b, city: e.target.value }))}
            onBlur={(e) => commit('city', e.target.value)}
            placeholder="—" className="h-7 text-sm" />
        </Cell>
        <Cell label="אזור / שכונה">
          <Input value={String(v('neighborhood') ?? '')}
            onChange={(e) => setBuf((b) => ({ ...b, neighborhood: e.target.value }))}
            onBlur={(e) => commit('neighborhood', e.target.value)}
            placeholder="—" className="h-7 text-sm" />
        </Cell>
        <Cell label="רחוב">
          <Input value={String(v('address') ?? '')}
            onChange={(e) => setBuf((b) => ({ ...b, address: e.target.value }))}
            onBlur={(e) => commit('address', e.target.value)}
            placeholder="—" className="h-7 text-sm" />
        </Cell>
        <Cell label="מס׳ בית">
          <Input value={String(meta.house_number ?? buf.__hn ?? '')}
            onChange={(e) => setBuf((b) => ({ ...b, __hn: e.target.value }))}
            onBlur={(e) => {
              const next = { ...meta, house_number: e.target.value || null };
              ensureListingAndPatch({ source_metadata: next });
              setBuf((b) => { const n = { ...b }; delete n.__hn; return n; });
            }}
            placeholder="—" className="h-7 text-sm" />
        </Cell>
        <Cell label="קומה">
          <Input type="number" value={String(v('floor') ?? '')}
            onChange={(e) => setBuf((b) => ({ ...b, floor: e.target.value }))}
            onBlur={(e) => commit('floor', e.target.value, true)}
            placeholder="—" className="h-7 text-sm" />
        </Cell>
        <Cell label="מעלית">
          <Select value={(listing as any)?.elevator === true ? 'yes' : (listing as any)?.elevator === false ? 'no' : ''}
            onValueChange={(val) => ensureListingAndPatch({ elevator: val === 'yes' })}>
            <SelectTrigger className="h-7 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">כן</SelectItem>
              <SelectItem value="no">לא</SelectItem>
            </SelectContent>
          </Select>
        </Cell>
        <Cell label="פתיחה">
          <p className="text-sm h-7 leading-7 text-slate-800 tabular-nums">
            {opening ? format(new Date(opening), 'dd/MM/yyyy') : '—'}
          </p>
        </Cell>
        <Cell label="עדכון אחרון">
          <p className="text-sm h-7 leading-7 text-slate-800 tabular-nums">
            {updated ? format(new Date(updated), 'dd/MM/yyyy') : '—'}
          </p>
        </Cell>
      </div>
    </div>
  );
}
