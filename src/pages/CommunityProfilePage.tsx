import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2, Loader2, LayoutGrid, List, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useListingFavorites } from '@/hooks/useListingFavorites';
import { fetchPublicBoardFeed } from '@/lib/publicBoardFeed';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import StandardPropertyCard from '@/components/public/StandardPropertyCard';
import { useUserRole } from '@/hooks/useUserRole';
import { publicAdTitle } from '@/lib/publicAdPresentation';
import { formatRentalPrice } from '@/lib/propertyPrice';
import { ProfileAssetMenu, QuickShareButton, profileAssetPath } from '@/components/community/ProfileAssetActions';
import { ROLE_BADGE } from '@/components/inbox/CommunityDirectory';

export const communityProfilePath = (id: string) => `/community/profile/${encodeURIComponent(id)}`;

export default function CommunityProfilePage() {
  const { userId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const favorites = useListingFavorites();
  const { isSuperAdmin } = useUserRole();
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [imageOpen, setImageOpen] = useState(false);
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
  const close = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'));
  const isOwner = isSuperAdmin || user?.id === userId;
  const initials = (p?.full_name ?? '').split(' ').map(s => s[0]).slice(0, 2).join('');
  const cities = p?.service_areas?.filter(Boolean).join(', ') || p?.city;
  return <main dir="rtl" className="mx-auto w-full max-w-6xl space-y-6 pb-6">
    {profile.isLoading && <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />}
    {profile.isError && <p role="alert" className="text-center text-destructive">טעינת הפרופיל נכשלה</p>}
    {!profile.isLoading && !profile.isError && !p && <div className="space-y-3 text-center"><p className="text-muted-foreground">הפרופיל אינו זמין</p><Button variant="outline" onClick={close}>סגירה</Button></div>}
    {p && <section className="space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <Button variant="ghost" disabled={!p.avatar_url} aria-label={`הצגת תמונת הפרופיל של ${p.full_name}`} onClick={() => setImageOpen(true)} className="h-28 w-28 rounded-full p-0 sm:h-32 sm:w-32 disabled:opacity-100">
          <Avatar className="h-full w-full"><AvatarImage src={p.avatar_url ?? undefined} alt={p.full_name ?? ''} className="object-cover" /><AvatarFallback className="text-3xl font-bold text-foreground">{initials}</AvatarFallback></Avatar>
        </Button>
        <h2 className="max-w-full break-words text-xl font-bold leading-relaxed sm:text-2xl">{p.full_name} - {ROLE_BADGE[p.category] ?? 'משתמש'}{p.category === 'broker' && p.license_number ? <span className="ms-2 inline text-base font-medium">· רישיון תיווך: <bdi>{p.license_number}</bdi></span> : null}</h2>
        {cities && <p className="max-w-full break-words text-base text-muted-foreground">{cities}</p>}
        <Button className="gap-2" onClick={() => navigate(`/inbox?community=${encodeURIComponent(p.id)}`)}><MessageCircle className="h-4 w-4" />שליחת הודעה</Button>
      </div>
      {(p.office_name || p.logo_url) && <div className="mx-auto flex w-full max-w-2xl items-center gap-4 rounded-md bg-muted/40 p-4">
        {p.logo_url ? <img src={p.logo_url} alt={p.office_name ? `לוגו ${p.office_name}` : 'לוגו משרד'} className="h-20 w-20 shrink-0 bg-background object-contain p-1" /> : <Building2 className="h-12 w-12 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 space-y-1"><h3 className="break-words text-lg font-bold">{p.office_name}</h3>{p.city && <p className="text-base text-muted-foreground">{p.city}</p>}</div>
      </div>}
      {p.bio && <div className="space-y-2"><h2 className="text-lg font-semibold">אודות</h2><p className="whitespace-pre-line text-base leading-relaxed text-muted-foreground">{p.bio}</p></div>}
      <Dialog open={imageOpen} onOpenChange={setImageOpen}><DialogContent data-fullscreen className="!h-[100dvh] !w-screen !max-w-none !rounded-none border-0 bg-background p-4 pt-14 shadow-none" aria-describedby={undefined}><DialogTitle className="sr-only">תמונת הפרופיל של {p.full_name}</DialogTitle>{p.avatar_url && <img src={p.avatar_url} alt={p.full_name ?? ''} className="h-full max-h-[calc(100dvh-5rem)] w-full object-contain" />}</DialogContent></Dialog>
    </section>}
    {p && <section className="space-y-3">
      <div className="flex items-center justify-between gap-2"><h2 className="min-w-0 text-xl font-bold">{listingIds.isLoading || feed.isLoading || listingIds.isError || feed.isError ? '' : `${cards.length} `}נכסים פעילים לשיתוף פעולה</h2>
        <div className="flex shrink-0" role="group" aria-label="תצוגת נכסים">
          <Button size="icon" variant={view === 'list' ? 'secondary' : 'ghost'} className="h-8 w-8" aria-label="תצוגת רשימה" title="תצוגת רשימה" aria-pressed={view === 'list'} onClick={() => setView('list')}><List className="h-4 w-4" /></Button>
          <Button size="icon" variant={view === 'grid' ? 'secondary' : 'ghost'} className="h-8 w-8" aria-label="תצוגת גריד" title="תצוגת גריד" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid className="h-4 w-4" /></Button>
        </div>
      </div>
      {(listingIds.isLoading || feed.isLoading) && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />}
      {(listingIds.isError || feed.isError) && <p role="alert" className="text-destructive">טעינת הנכסים נכשלה</p>}
      {listingIds.data && feed.data && !cards.length && <p className="text-muted-foreground">אין כרגע נכסים פעילים</p>}
      {view === 'grid' ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards.map(card => { const title = publicAdTitle(card); const fav = favorites.favoriteIds.has(card.id); return <StandardPropertyCard key={card.id} card={card} signedIn isFav={fav} onFavorite={() => void favorites.toggleFavorite(card.id)} menu={<ProfileAssetMenu card={card} title={title} isOwner={isOwner} isFav={fav} onFavorite={() => void favorites.toggleFavorite(card.id)} />} actions={<div className="mb-2"><QuickShareButton title={title} path={profileAssetPath(card)} label /></div>} />; })}</div>
      : <ul className="divide-y divide-border">{cards.map(card => { const title = publicAdTitle(card); const fav = favorites.favoriteIds.has(card.id); const path = profileAssetPath(card); return <li key={card.id} role="link" tabIndex={0} onClick={() => navigate(path)} onKeyDown={(e) => { if (e.target === e.currentTarget && e.key === 'Enter') navigate(path); }} className="flex cursor-pointer items-center gap-3 py-3 hover:bg-muted/50">
        {card.photos[0] ? <img src={card.photos[0]} alt={title} loading="lazy" className="h-16 w-20 shrink-0 rounded-md object-cover" /> : <div className="h-16 w-20 shrink-0 rounded-md bg-muted" />}
        <div className="min-w-0 flex-1"><p className="truncate font-semibold">{title}</p><p className="text-sm text-muted-foreground">{formatRentalPrice(card.price, card.deal_type) || 'מחיר לא צוין'}{card.rooms ? ` · ${card.rooms} חד׳` : ''}{card.sqm ? ` · ${card.sqm} מ״ר` : ''}</p></div>
        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}><QuickShareButton title={title} path={path} /><ProfileAssetMenu card={card} title={title} isOwner={isOwner} isFav={fav} onFavorite={() => void favorites.toggleFavorite(card.id)} /></div>
      </li>; })}</ul>}
    </section>}
  </main>;
}
