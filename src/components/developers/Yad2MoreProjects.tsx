import { useQuery } from '@tanstack/react-query';
import { FileDown, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { hasMoreOnYad2, importRatioLabel } from '@/lib/importRatio';

/** Under My Projects: shown only when Yad2 lists more of this developer's projects than were imported. */
export function Yad2MoreProjects({ ownerId, onImport, onManual }: { ownerId: string | null | undefined; onImport: () => void; onManual: () => void }) {
  const { data } = useQuery({
    queryKey: ['yad2-project-gap', ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_yad2_project_gap', { _owner: ownerId as string });
      if (error) throw error;
      return (data ?? null) as { imported?: number; total?: number | null } | null;
    },
  });
  if (!data || !hasMoreOnYad2(data.imported, data.total)) return null;
  return <div className="flex flex-wrap items-center justify-center gap-2 py-4">
    <span dir="ltr" className="tabular-nums text-muted-foreground">{importRatioLabel(data.imported, data.total)}</span>
    <Button variant="outline" className="h-11 gap-2" onClick={onImport}><FileDown className="h-4 w-4" />ייבוא שאר הפרויקטים מיד2</Button>
    <Button variant="outline" className="h-11 gap-2" onClick={onManual}><Pencil className="h-4 w-4" />הוספה ידנית</Button>
  </div>;
}
