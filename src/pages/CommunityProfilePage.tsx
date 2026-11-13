import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { BadgeCheck, Building2, Loader2, MapPin, MessageCircle, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useListingFavorites } from '@/hooks/useListingFavorites';
import { fetchPublicBoardFeed } from '@/lib/publicBoardFeed';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import StandardPropertyCard from '@/components/public/StandardPropertyCard';
import { ROLE_BADGE } from '@/components/inbox/CommunityDirectory';

export const communityProfilePath = (id: string) => `/community/profile/${encodeURIComponent(id)}`;

export default function CommunityProfilePage() {
  const { userId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const favorites = useListingFavorites();
  const profile = useQuery({
    queryKey: ['community-profile-page', user?.id, userId], enabled: !!user && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_profile_page', { _user: userId });
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
  });
  const listingIds = useQuery({
    queryKey: ['community-profile-listings', userId], enabled: !!user && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_profile_listings', { _user: userId });
      if (error) throw error;
      return new Set((data ?? []).map(l => l.id));
    },
  });
  const feed = useQuery({ queryKey: ['partner-activity-board', user?.id, 'profile'], queryFn: fetchPublicBoardFeed, enabled: !!user, staleTime: 60_000 });
  const cards = (feed.data ?? []).filter(card => listingIds.data?.has(card.id));
  const p = profile.data;
  const close = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));
  const initials = (p?.full_name ?? '').split(' ').map(s => s[0]).slice(0, 2).join('');
  return <main dir="rtl" className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
    <div className="flex justify-end"><Button variant="ghost" size="icon" aria-label="סגירה" onClick={close}><X className="h-5 w-5" /></Button></div>
    {profile.isLoading && <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />}
    {profile.isError && <p role="alert" className="text-center text-destructive">טעינת הפרופיל נכשלה</p>}
    {!profile.isLoading && !profile.isError && !p && <p className="text-center text-muted-foreground">הפרופיל אינו זמין</p>}
    {p && <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="h-24 bg-gradient-to-l from-primary/25 via-primary/10 to-accent/20" />
      <div className="-mt-12 flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end">
        <Avatar className="h-24 w-24 shrink-0 border-4 border-card shadow-md"><AvatarImage src={p.avatar_url ?? undefined} alt={p.full_name ?? ''} className="object-cover" /><AvatarFallback className="text-2xl font-bold">{initials}</AvatarFallback></Avatar>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold text-foreground">{p.full_name}</h1><Badge variant="secondary">{ROLE_BADGE[p.category] ?? 'משתמש'}</Badge></div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
            {p.office_name && <span className="inline-flex items-center gap-1"><Building2 className="h-4 w-4" />{p.office_name}</span>}
            {p.license_number && <span className="inline-flex items-center gap-1"><BadgeCheck className="h-4 w-4 text-primary" />רישיון תיווך {p.license_number}</span>}
            {p.city && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{p.city}</span>}
          </div>
        </div>
        {p.logo_url && <img src={p.logo_url} alt={p.office_name ? `לוגו ${p.office_name}` : 'לוגו משרד'} className="h-20 w-20 shrink-0 rounded-lg border border-border bg-background object-contain p-1" />}
        <Button className="shrink-0 gap-2" onClick={() => navigate(`/inbox?community=${encodeURIComponent(p.id)}`)}><MessageCircle className="h-4 w-4" />שליחת הודעה</Button>
      </div>
      {(p.bio || (p.service_areas?.length ?? 0) > 0) && <div className="grid gap-4 border-t border-border p-5 sm:grid-cols-2">
        {p.bio && <div><h2 className="mb-1 font-semibold">אודות</h2><p className="whitespace-pre-line text-muted-foreground">{p.bio}</p></div>}
        {!!p.service_areas?.length && <div><h2 className="mb-1 font-semibold">תחומי פעילות</h2><div className="flex flex-wrap gap-1.5">{p.service_areas.map(a => <Badge key={a} variant="outline">{a}</Badge>)}</div></div>}
      </div>}
    </section>}
    {p && <section className="space-y-3">
      <h2 className="text-xl font-bold">נכסים פעילים לשיתוף פעולה</h2>
      {(listingIds.isLoading || feed.isLoading) && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />}
      {(listingIds.isError || feed.isError) && <p role="alert" className="text-destructive">טעינת הנכסים נכשלה</p>}
      {listingIds.data && feed.data && !cards.length && <p className="text-muted-foreground">אין כרגע נכסים פעילים</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards.map(card => <StandardPropertyCard key={card.id} card={card} signedIn showOwnerMenu={false} isFav={favorites.favoriteIds.has(card.id)} onFavorite={() => void favorites.toggleFavorite(card.id)} />)}</div>
    </section>}
  </main>;
}
