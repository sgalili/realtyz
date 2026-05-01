import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, Star } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';
import { ListingVisibilityToggle } from '@/components/listings/ListingVisibilityToggle';
import { Link } from 'react-router-dom';

interface LiveListing {
  id: string;
  property_title: string;
  city: string | null;
  asking_price: number | null;
  is_featured: boolean;
  is_promoted: boolean;
  created_at: string;
}

const fmtPrice = (n: number | null) => {
  if (!n || n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.00$/, '')}M ₪`;
  return `${Math.round(n).toLocaleString('he-IL')} ₪`;
};

export function ListingVisibilityManagerCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { isAdmin, isManagingBroker, isSuperAdmin } = useUserRole();
  const { settings } = usePlatformSettings();

  const canSee = isAdmin || isManagingBroker || isSuperAdmin;

  const { data, isLoading } = useQuery({
    queryKey: ['live-listings-visibility', user?.id],
    enabled: !!user?.id && canSee && settings.enable_featured_listings,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('id, property_title, city, asking_price, is_featured, is_promoted, created_at')
        .eq('user_id', user!.id)
        .eq('status', 'live')
        .order('is_promoted', { ascending: false })
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as LiveListing[];
    },
    staleTime: 30_000,
  });

  if (!canSee || !settings.enable_featured_listings) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="h-4 w-4 text-warning" />
              נכסים מומלצים / מקודמים
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              חשוף רק למנהלים. סמן/י נכסים כ-Featured או Promoted לקטלוג ולשיווק.
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-[10px]">Admin</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            אין נכסים פעילים עדיין. <Link to="/properties" className="text-primary underline">לקטלוג</Link>
          </p>
        ) : (
          <ul className="space-y-2">
            {data.map((l) => (
              <li
                key={l.id}
                className="flex items-center gap-3 p-2.5 rounded-lg border bg-background hover:bg-muted/30 transition"
              >
                <div className="h-9 w-9 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Building2 className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{l.property_title}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[l.city, fmtPrice(l.asking_price)].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <ListingVisibilityToggle
                  listingId={l.id}
                  isFeatured={l.is_featured}
                  isPromoted={l.is_promoted}
                  invalidateKeys={[['live-listings-visibility', user?.id]]}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default ListingVisibilityManagerCard;
