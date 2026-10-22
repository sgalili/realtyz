import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useReadyBoardProperties } from '@/hooks/useReadyBoardProperties';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { QuickPublicPromotion } from '@/components/properties/QuickPublicPromotion';

type Row = import('@/hooks/useReadyBoardProperties').ReadyBoardProperty;

/** Search the active workspace's "My Properties" and bulk-publish selected ones publicly (explicit confirmation inside QuickPublicPromotion). */
export function MyPropertiesPicker() {
  const { activeWorkspaceId } = useWorkspace();
  const [q, setQ] = useState('');
  const [opened, setOpened] = useState(false);
  const { data: available = [] } = useReadyBoardProperties();
  const [selected, setSelected] = useState<Map<string, Row>>(new Map());

  useEffect(() => {
    setQ(''); setOpened(false); setSelected(new Map());
  }, [activeWorkspaceId]);
  const term = q.trim().toLocaleLowerCase();
  const rows = available.filter(row => !term || [row.property_title, row.address, row.city].some(value => value?.toLocaleLowerCase().includes(term)));

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
