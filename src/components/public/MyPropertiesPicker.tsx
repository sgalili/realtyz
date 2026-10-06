import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { QuickPublicPromotion } from '@/components/properties/QuickPublicPromotion';

type Row = { id: string; property_title: string | null; address: string | null; city: string | null; asking_price: number | null; is_published: boolean | null };

/** Search the active workspace's "My Properties" and bulk-publish selected ones publicly (explicit confirmation inside QuickPublicPromotion). */
export function MyPropertiesPicker() {
  const { activeWorkspaceId } = useWorkspace();
  const [q, setQ] = useState('');
  const [opened, setOpened] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Map<string, Row>>(new Map());

  useEffect(() => {
    if (!activeWorkspaceId) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      let query = supabase.from('listings').select('id,property_title,address,city,asking_price,is_published')
        .eq('workspace_owner_id', activeWorkspaceId).neq('status', 'discarded').order('created_at', { ascending: false }).limit(8);
      const term = q.trim().replace(/[%,()]/g, ' ');
      if (term) query = query.or(`property_title.ilike.%${term}%,address.ilike.%${term}%,city.ilike.%${term}%`);
      const { data } = await query;
      if (!cancelled) setRows((data as Row[]) ?? []);
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, activeWorkspaceId]);

  const toggle = (r: Row) => setSelected(prev => { const n = new Map(prev); if (n.has(r.id)) n.delete(r.id); else n.set(r.id, r); return n; });

  return (
    <div className="space-y-2">
      <Label htmlFor="my-props-search">הוספה מהנכסים שלי</Label>
      <div className="relative">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input id="my-props-search" value={q} onChange={e => setQ(e.target.value)} onFocus={() => setOpened(true)} placeholder="חיפוש נכסים" className="pr-9" autoComplete="off" />
      </div>
      {opened && rows.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-md border divide-y">
          {rows.map(r => (
            <li key={r.id}>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r)} />
                <span className="min-w-0 flex-1 truncate">{r.property_title || [r.address, r.city].filter(Boolean).join(', ') || 'נכס'}</span>
                {r.is_published && <span className="text-xs text-muted-foreground">מפורסם</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{selected.size} נבחרו</span>
          <QuickPublicPromotion ids={[...selected.keys()]} onPublished={() => setSelected(new Map())} />
        </div>
      )}
    </div>
  );
}
