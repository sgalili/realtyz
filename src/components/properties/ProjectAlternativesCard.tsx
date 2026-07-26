import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, BedDouble, Ruler, Layers, ArrowLeft } from 'lucide-react';

interface ProjectAlternativesCardProps {
  /** Current listing id — excluded from results. */
  currentListingId?: string | null;
  /** Project name to match (e.g. "רביבים"). */
  projectName: string | null | undefined;
  /** Compact = horizontal scrollable thumbnails. */
  compact?: boolean;
  /** Optional max items returned. */
  limit?: number;
}

function formatPrice(n: number | null | undefined) {
  if (!n) return '—';
  return `₪${Number(n).toLocaleString('he-IL')}`;
}

export function ProjectAlternativesCard({
  currentListingId,
  projectName,
  compact = false,
  limit = 12,
}: ProjectAlternativesCardProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['project-alternatives', projectName, currentListingId],
    enabled: !!projectName,
    queryFn: async () => {
      let q = supabase
        .from('listings')
        .select('id, property_title, asking_price, rooms, sqm, floor, address, city, neighborhood, status, slug')
        .eq('project_name', projectName!)
        .eq('is_published', true)
        .order('asking_price', { ascending: true })
        .limit(limit);
      if (currentListingId) q = q.neq('id', currentListingId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!projectName) return null;

  return (
    <Card className="p-4 sm:p-5" dir="rtl">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-primary inline-flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            אפשרויות נוספות בפרויקט {projectName}
          </h2>
          <p className="text-base text-muted-foreground mt-1">
            יחידות נוספות בפרויקט — כולל פרי-סייל ו״אוף-מרקט״ שעדיין לא פורסמו רשמית.
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0">{data?.length ?? 0} יחידות</Badge>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-lg text-muted-foreground">אין כרגע יחידות נוספות זמינות בפרויקט.</p>
      ) : (
        <div className={compact
          ? 'flex gap-2 overflow-x-auto pb-1'
          : 'grid grid-cols-1 sm:grid-cols-2 gap-2'
        }>
          {data.map((row) => (
            <Link
              key={row.id}
              to={`/property/${row.id}`}
              className={`group rounded-lg border bg-card p-3 hover:border-primary transition-colors ${compact ? 'min-w-[240px]' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-lg font-semibold text-foreground truncate">
                  {row.property_title || 'יחידה בפרויקט'}
                </p>
                <ArrowLeft className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
              </div>
              <p className="text-base text-muted-foreground truncate mt-0.5">
                {[row.address, row.neighborhood, row.city].filter(Boolean).join(', ') || '—'}
              </p>
              <div className="flex items-center gap-3 mt-2 text-base text-muted-foreground">
                {row.rooms != null && (
                  <span className="inline-flex items-center gap-1"><BedDouble className="h-3 w-3" />{Number(row.rooms)}</span>
                )}
                {row.sqm != null && (
                  <span className="inline-flex items-center gap-1"><Ruler className="h-3 w-3" />{row.sqm} מ״ר</span>
                )}
                {row.floor != null && (
                  <span className="inline-flex items-center gap-1"><Layers className="h-3 w-3" />ק׳ {row.floor}</span>
                )}
              </div>
              <p className="text-lg font-bold text-success mt-1 tabular-nums">
                {formatPrice(row.asking_price as number | null)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
