// Favorites are user-scoped rows in listing_favorites. One cached list keeps the
// board hearts, the property page and the "ניהול המודעה שלי" menu in sync.
import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export const listingFavoritesKey = (userId?: string) => ['listing-favorites', userId ?? 'guest'];

export function useListingFavorites() {
  const { user } = useAuth();
  const client = useQueryClient();
  const queryKey = listingFavoritesKey(user?.id);

  const query = useQuery({
    queryKey,
    enabled: !!user?.id,
    queryFn: async () => {
      if (!user?.id) return [] as string[];
      const { data, error } = await supabase.from('listing_favorites').select('listing_id').eq('user_id', user.id);
      if (error) throw error;
      return ((data ?? []) as Array<{ listing_id: string }>).map((row) => row.listing_id);
    },
  });

  const favoriteIds = useMemo(() => new Set(query.data ?? []), [query.data]);

  const toggleFavorite = async (listingId: string) => {
    if (!user?.id) return;
    const isFav = favoriteIds.has(listingId);
    const add = (saved: string[]) => [...saved.filter((id) => id !== listingId), listingId];
    const remove = (saved: string[]) => saved.filter((id) => id !== listingId);
    // Flip the cached list first so every heart and menu item reacts at once.
    client.setQueryData<string[]>(queryKey, (current) => (isFav ? remove(current ?? []) : add(current ?? [])));
    const { error } = isFav
      ? await supabase.from('listing_favorites').delete().eq('user_id', user.id).eq('listing_id', listingId)
      : await supabase.from('listing_favorites').insert({ user_id: user.id, listing_id: listingId });
    if (error) {
      // The write failed, so put the saved list back exactly as it was.
      client.setQueryData<string[]>(queryKey, (current) => (isFav ? add(current ?? []) : remove(current ?? [])));
      toast.error('שמירת המועדף נכשלה, נסו שוב');
      return;
    }
    toast.success(isFav ? 'הנכס הוסר מהמועדפים' : 'הנכס נשמר במועדפים');
  };

  return { favoriteIds, isFavorite: (listingId: string) => favoriteIds.has(listingId), toggleFavorite };
}
