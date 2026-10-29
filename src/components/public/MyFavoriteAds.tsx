import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Heart, ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/pages/PublicListingPage';
import PropertyReferralButton from './PropertyReferralButton';
import { useListingAudience } from '@/hooks/useListingAudience';

type Favorite = { listing_id: string; property: { slug?: string; property_title?: string; address?: string; city?: string; image_url?: string; media_photos?: string[]; asking_price?: number; deal_type?: string } | null };

export default function MyFavoriteAds() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const queryKey = ['my-favorite-ads', user?.id];
  const favorites = useQuery({
    queryKey, enabled: Boolean(user?.id), refetchOnMount: 'always', refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!user?.id) return [];
      const saved: Array<{ listing_id: string }> = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from('listing_favorites').select('listing_id').eq('user_id', user.id).order('listing_id').range(offset, offset + 499);
        if (error) throw error;
        saved.push(...(data ?? []));
        if ((data?.length ?? 0) < 500) break;
      }
      const rows: Favorite[] = [];
      for (let offset = 0; offset < saved.length; offset += 8) {
        rows.push(...await Promise.all(saved.slice(offset, offset + 8).map(async ({ listing_id }) => {
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-listing-view?id=${encodeURIComponent(listing_id)}`, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } });
          if (response.status === 404) return { listing_id, property: null };
          if (!response.ok) throw new Error('Favorite unavailable');
          const payload = await response.json();
          return { listing_id, property: payload.property ?? null } as Favorite;
        })));
      }
      return rows;
    },
  });
  const remove = async (id: string) => {
    if (!user?.id || removing.has(id)) return;
    setRemoving(current => new Set(current).add(id));
    try {
      const { error } = await supabase.from('listing_favorites').delete().eq('user_id', user.id).eq('listing_id', id);
      if (error) throw error;
      client.setQueryData<Favorite[]>(queryKey, current => current?.filter(row => row.listing_id !== id));
      toast.success('הנכס הוסר מהמועדפים');
    } catch { toast.error('ההסרה נכשלה, נסו שוב'); }
    finally { setRemoving(current => { const next = new Set(current); next.delete(id); return next; }); }
  };
  const audience = useListingAudience((favorites.data ?? []).map(row => row.listing_id));
  const visibleFavorites = favorites.data?.filter(row => audience.isVisible(row.listing_id));
  if (favorites.isLoading || audience.isLoading) return <div className="flex justify-center py-10"><Loader2 aria-label="טעינת מועדפים" className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (favorites.isError) return <div role="alert">לא ניתן לטעון את המועדפים <Button variant="link" onClick={() => void favorites.refetch()}>ניסיון נוסף</Button></div>;
  if (!visibleFavorites?.length) return <p className="py-10 text-center text-muted-foreground">עדיין אין מודעות במועדפים.</p>;
  return <div className="space-y-3">{visibleFavorites.map(({ listing_id, property }) => {
    const title = property ? [property.address, property.city].filter(Boolean).join(', ') || property.property_title || 'נכס' : 'המודעה אינה זמינה עוד';
    const photo = property?.image_url || property?.media_photos?.[0];
    return <article key={listing_id} data-favorite-ad={listing_id} className="flex min-w-0 items-center gap-3 rounded-lg border bg-card p-3">
      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">{photo ? <img src={photo} alt={title} loading="lazy" className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6 text-muted-foreground" />}</div>
      <div className="min-w-0 flex-1">{property ? <Link to={`/p/${property.slug || listing_id}`} className="block break-words font-semibold text-foreground">{title}</Link> : <p className="text-sm text-muted-foreground">{title}</p>}{property && <p className="font-bold text-primary">{formatPrice(Number(property.asking_price) || 0, property.deal_type === 'rent' ? 'rent' : property.deal_type === 'sale' ? 'sale' : null)}{property.deal_type === 'rent' && Number(property.asking_price) ? <span className="ms-1 text-xs font-normal"> / לחודש</span> : null}</p>}</div>
      {property && <PropertyReferralButton listingId={listing_id} />}
      <Button variant="ghost" size="icon" className="shrink-0 text-destructive" aria-label={`הסרה מהמועדפים: ${title}`} title="הסרה מהמועדפים" disabled={removing.has(listing_id)} onClick={() => void remove(listing_id)}>{removing.has(listing_id) ? <Loader2 className="h-5 w-5 animate-spin" /> : <Heart className="h-5 w-5 fill-current" />}</Button>
    </article>;
  })}</div>;
}