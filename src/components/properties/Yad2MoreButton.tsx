import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, Link2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useBrokersOnly } from '@/hooks/usePlatformMode';
import { hasMoreOnYad2, importRatioLabel } from '@/lib/importRatio';

/** Shown under My Properties only when Yad2 holds more of this workspace's ads than were imported. */
export function Yad2MoreButton({ ownerId }: { ownerId: string | null | undefined }) {
  const brokersOnly = useBrokersOnly();
  const { data } = useQuery({
    queryKey: ['yad2-import-gap', ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_yad2_import_gap', { _owner: ownerId as string });
      if (error) throw error;
      return (data ?? null) as { imported?: number; total?: number | null } | null;
    },
  });
  if (!data || !hasMoreOnYad2(data.imported, data.total)) return null;
  const dispatch = (action: 'manual' | 'yad2' | 'import') => window.dispatchEvent(new CustomEvent('properties:add', { detail: { action } }));
  return <div className="flex justify-center py-4">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-11 gap-2 text-base"><Plus className="h-4 w-4" />הוספת נכסים <span dir="ltr" className="tabular-nums text-muted-foreground">{importRatioLabel(data.imported, data.total)}</span></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        <DropdownMenuItem className="gap-2" onClick={() => dispatch('yad2')}><Link2 className="h-4 w-4" />ייבוא מיד2</DropdownMenuItem>
        <DropdownMenuItem className="gap-2" onClick={() => dispatch('manual')}><Plus className="h-4 w-4" />הזנה ידנית</DropdownMenuItem>
        {!brokersOnly && <DropdownMenuItem className="gap-2" onClick={() => dispatch('import')}><FileSpreadsheet className="h-4 w-4" />יבוא נכסים מאקסל</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}
