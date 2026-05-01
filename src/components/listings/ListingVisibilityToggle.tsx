import { useState } from 'react';
import { Star, Megaphone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useUserRole } from '@/hooks/useUserRole';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';

interface Props {
  listingId: string;
  isFeatured: boolean;
  isPromoted: boolean;
  invalidateKeys?: unknown[][];
  size?: 'sm' | 'xs';
}

export function ListingVisibilityToggle({
  listingId,
  isFeatured,
  isPromoted,
  invalidateKeys = [],
  size = 'xs',
}: Props) {
  const qc = useQueryClient();
  const { isAdmin, isManagingBroker, isSuperAdmin } = useUserRole();
  const { settings } = usePlatformSettings();
  const [busy, setBusy] = useState<null | 'featured' | 'promoted'>(null);

  const canEdit = isAdmin || isManagingBroker || isSuperAdmin;
  if (!canEdit || !settings.enable_featured_listings) return null;

  const update = async (col: 'is_featured' | 'is_promoted', value: boolean) => {
    setBusy(col === 'is_featured' ? 'featured' : 'promoted');
    const { error } = await supabase
      .from('listings')
      .update({ [col]: value })
      .eq('id', listingId);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(value ? 'סומן' : 'בוטל');
    invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
  };

  const btn = size === 'sm'
    ? 'h-8 px-2 text-xs gap-1'
    : 'h-7 px-2 text-[11px] gap-1';

  return (
    <div className="flex items-center gap-1.5" dir="rtl">
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => update('is_featured', !isFeatured)}
        className={cn(
          'rounded-md border transition flex items-center',
          btn,
          isFeatured
            ? 'border-warning bg-warning/10 text-warning'
            : 'border-border bg-background hover:bg-muted/40 text-muted-foreground',
        )}
        title="סמן כנכס מומלץ"
      >
        <Star className={cn('h-3.5 w-3.5', isFeatured && 'fill-current')} />
        Featured
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => update('is_promoted', !isPromoted)}
        className={cn(
          'rounded-md border transition flex items-center',
          btn,
          isPromoted
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border bg-background hover:bg-muted/40 text-muted-foreground',
        )}
        title="סמן כנכס מקודם בתשלום"
      >
        <Megaphone className="h-3.5 w-3.5" />
        Promoted
      </button>
    </div>
  );
}

export default ListingVisibilityToggle;
