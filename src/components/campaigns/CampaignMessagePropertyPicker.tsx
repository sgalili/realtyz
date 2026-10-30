import { useEffect, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { useAppMode } from '@/hooks/useAppMode';
import { useAffiliateLicense } from '@/hooks/useAffiliateLicense';
import { fetchPartnerCampaignInventory } from '@/lib/partnerCampaignInventory';
import { projectCampaignTargets } from '../../../supabase/functions/_shared/projectCampaignTargets';
import { campaignMessagePropertyLabel, type CampaignMessageProperty } from '@/lib/campaignMessageProperty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function CampaignMessagePropertyPicker({ value, onChange }: {
  value: CampaignMessageProperty | null;
  onChange: (property: CampaignMessageProperty | null) => void;
}) {
  const workspaceId = useActiveWorkspaceOwnerId();
  const { isPartnerMode } = useAppMode();
  const { level4Unlocked } = useAffiliateLicense();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [properties, setProperties] = useState<CampaignMessageProperty[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setOpen(false); setQuery(''); setProperties([]); onChange(null);
  }, [workspaceId, isPartnerMode, level4Unlocked, onChange]);

  useEffect(() => {
    if (!open || !workspaceId) return;
    let cancelled = false;
    setLoading(true); setFailed(false); setProperties([]);
    void (async () => {
      try {
        const rows: CampaignMessageProperty[] = [];
        if (isPartnerMode) rows.push(...await fetchPartnerCampaignInventory(level4Unlocked));
        else {
          for (let from = 0; ; from += 1000) {
            const { data, error } = await supabase.from('listings')
              .select('id, property_title, address, city').eq('workspace_owner_id', workspaceId)
              .order('created_at', { ascending: false }).range(from, from + 999);
            if (error) throw error;
            rows.push(...data);
            if (data.length < 1000) break;
          }
          for (let from = 0; ; from += 1000) {
            const { data, error } = await supabase.from('developer_projects').select('*')
              .eq('workspace_owner_id', workspaceId).order('created_at', { ascending: false }).range(from, from + 999);
            if (error) throw error;
            rows.push(...data.flatMap(project => projectCampaignTargets(project)).map(target => ({
              id: target.id,
              property_title: target.property_title,
              address: typeof target.address === 'string' ? target.address : null,
              city: typeof target.city === 'string' ? target.city : null,
            })));
            if (data.length < 1000) break;
          }
        }
        if (!cancelled) setProperties(Array.from(new Map(rows.map(row => [row.id, row])).values()));
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, workspaceId, isPartnerMode, level4Unlocked]);

  const visible = properties.filter(property => campaignMessagePropertyLabel(property).toLowerCase().includes(query.trim().toLowerCase()));
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" role="combobox" aria-expanded={open}
        aria-label="בחירת נכס לקמפיין" className="w-full justify-between gap-2 text-right text-[17px] font-bold">
        <span className="min-w-0 truncate">{value ? campaignMessagePropertyLabel(value) : 'קידום נכס מהמאגר'}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" dir="rtl" className="w-[--radix-popover-trigger-width] p-2">
      <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="חפש לפי כותרת, עיר או כתובת…" className="mb-2 text-right" />
      <div className="max-h-64 overflow-y-auto">
        <Button type="button" variant="ghost" className="w-full justify-start text-right" onClick={() => { onChange(null); setOpen(false); }}>ללא נכס · הודעה כללית</Button>
        {loading ? <p className="p-3 text-sm text-muted-foreground">טוען נכסים מהמאגר…</p>
          : failed ? <p className="p-3 text-sm text-destructive">טעינת המאגר נכשלה. סגרו ופתחו שוב כדי לנסות מחדש.</p>
          : visible.length === 0 ? <p className="p-3 text-sm text-muted-foreground">לא נמצאו נכסים תואמים לחיפוש</p>
          : visible.map(property => <Button key={property.id} type="button" variant="ghost"
            className="h-auto min-h-10 w-full justify-between gap-2 text-right text-[17px]" onClick={() => { onChange(property); setOpen(false); }}>
            <span className="min-w-0 truncate">{campaignMessagePropertyLabel(property)}</span>
            {value?.id === property.id && <Check className="h-4 w-4 shrink-0" />}
          </Button>)}
      </div>
    </PopoverContent>
  </Popover>;
}