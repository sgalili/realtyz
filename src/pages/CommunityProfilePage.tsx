import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2, Loader2, MessageCircle, X, ArrowUpLeft, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useListingFavorites } from '@/hooks/useListingFavorites';
import { fetchPublicBoardFeed } from '@/lib/publicBoardFeed';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import StandardPropertyCard from '@/components/public/StandardPropertyCard';
import ExpandedPropertyDetails from '@/components/public/ExpandedPropertyDetails';
import { AnimatedExpansion } from '@/components/ui/animated-expansion';
import { ViewModeSwitch } from '@/components/ui/view-mode-switch';
import { useUserRole } from '@/hooks/useUserRole';
import { publicAdTitle } from '@/lib/publicAdPresentation';
import { ProfileAssetMenu } from '@/components/community/ProfileAssetActions';
import { ROLE_BADGE } from '@/components/inbox/CommunityDirectory';

export const communityProfilePath = (id: string) => `/community/profile/${encodeURIComponent(id)}`;

export default function CommunityProfilePage() {
  const { userId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeWorkspaceId, setActiveWorkspace } = useWorkspace();
  const favorites = useListingFavorites();
  const { isSuperAdmin } = useUserRole();
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  useEffect(() => { setView('list'); setExpandedId(null); }, [user?.id, userId]);
  const [imageOpen, setImageOpen] = useState(false);
  const profile = useQuery({
    queryKey: ['community-profile-page', user?.id, userId], enabled: !!user && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_profile_page', { _user: userId });
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
  });
  const management = useQuery({ queryKey: ['profile-management', user?.id, activeWorkspaceId, userId], enabled: !!user && !!userId, queryFn: async () => {
    const { data, error } = await supabase.rpc('profile_management_access', { _user: userId });
    if (error) throw error;
    return data === true;
  } });
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
  const office = useQuery({ queryKey: ['community-office', user?.id, userId], enabled: !!p, queryFn: async () => {
    const { data, error } = await supabase.rpc('community_office_members', { _user: userId });
    if (error) throw error;
    return data ?? [];
  } });
  const projects = useQuery({ queryKey: ['community-projects', user?.id, userId], enabled: p?.category === 'developer', queryFn: async () => {
    const { data, error } = await supabase.rpc('community_public_projects', { _user: userId });
    if (error) throw error;
    return data ?? [];
  } });
  const close = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'));
  const isOwner = isSuperAdmin || user?.id === userId;
  const initials = (p?.full_name ?? '').split(' ').map(s => s[0]).slice(0, 2).join('');
  const cities = p?.service_areas?.filter(Boolean).join(', ') || p?.city;
  return <main dir="rtl" data-no-hero-wave className="relative mx-auto w-full max-w-6xl space-y-6 pb-6">
    <Button size="icon" variant="ghost" aria-label="סגירה וחזרה לדף הקודם" title="סגירה" onClick={close} className="absolute left-0 top-0 z-10 h-11 w-11"><X className="h-5 w-5" /></Button>
    {profile.isLoading && <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />}
    {profile.isError && <p role="alert" className="text-center text-destructive">טעינת הפרופיל נכשלה</p>}
    {!profile.isLoading && !profile.isError && !p && <div className="space-y-3 text-center"><p className="text-muted-foreground">הפרופיל אינו זמין</p><Button variant="outline" onClick={close}>סגירה</Button></div>}
    {p && <section className="!mt-0 space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <Button variant="ghost" disabled={!p.avatar_url} aria-label={`הצגת תמונת הפרופיל של ${p.full_name}`} onClick={() => setImageOpen(true)} className="h-28 w-28 rounded-full p-0 sm:h-32 sm:w-32 disabled:opacity-100">
          <Avatar className="h-full w-full"><AvatarImage src={p.avatar_url ?? undefined} alt={p.full_name ?? ''} className="object-cover" /><AvatarFallback className="text-3xl font-bold text-foreground">{initials}</AvatarFallback></Avatar>
        </Button>
        <h1 className="max-w-full break-words text-xl font-bold leading-relaxed sm:text-2xl">{p.full_name} - {ROLE_BADGE[p.category] ?? 'משתמש'}{p.category === 'broker' && p.license_number ? <span className="ms-2 inline text-base font-medium"><bdi>{p.license_number}</bdi></span> : null}</h1>
        {cities && <p className="max-w-full break-words text-base text-muted-foreground">{cities}</p>}
        {p.bio && <p className="max-w-2xl whitespace-pre-line break-words text-base leading-relaxed text-muted-foreground">{p.bio}</p>}
        <div className="!mt-5 flex flex-wrap justify-center gap-2">
          {user?.id !== p.id && <Button className="gap-2" onClick={() => navigate(`/inbox?community=${encodeURIComponent(p.id)}`)}><MessageCircle className="h-4 w-4" />שליחת הודעה</Button>}
          {management.data === true && <Button variant="outline" onClick={async () => { if (activeWorkspaceId !== userId) await setActiveWorkspace(userId); navigate('/profile'); }}><Pencil className="h-4 w-4" />עריכה / ניהול</Button>}
        </div>
      </div>
      {(p.office_name || p.logo_url) && <div className="mx-auto flex w-full max-w-2xl items-center gap-4 rounded-md bg-muted/40 p-4">
        {p.logo_url ? <img src={p.logo_url} alt={p.office_name ? `לוגו ${p.office_name}` : 'לוגו משרד'} className="h-20 w-20 shrink-0 bg-background object-contain p-1" /> : <Building2 className="h-12 w-12 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1 space-y-1"><h3 className="break-words text-lg font-bold">{p.office_name}</h3>{p.city && <p className="text-base text-muted-foreground">{p.city}</p>}</div>
        {(office.data?.length ?? 0) > 1 && <Button variant="ghost" size="icon" aria-label="למשרד ולצוות" title="למשרד ולצוות" onClick={() => navigate(`/community/office/${encodeURIComponent(userId)}`)}><ArrowUpLeft className="h-5 w-5" /></Button>}
      </div>}
      <Dialog open={imageOpen} onOpenChange={setImageOpen}><DialogContent data-fullscreen className="!h-[100dvh] !w-screen !max-w-none !rounded-none border-0 bg-background p-4 pt-14 shadow-none" aria-describedby={undefined}><DialogTitle className="sr-only">תמונת הפרופיל של {p.full_name}</DialogTitle>{p.avatar_url && <img src={p.avatar_url} alt={p.full_name ?? ''} className="h-full max-h-[calc(100dvh-5rem)] w-full object-contain" />}</DialogContent></Dialog>
    </section>}
    {p?.category === 'developer' && <section className="space-y-3"><h2 className="text-xl font-bold">{projects.data?.length ?? ''} פרויקטים פעילים</h2>
      {projects.isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      {projects.isError && <p role="alert" className="text-destructive">טעינת הפרויקטים נכשלה</p>}
      {projects.data?.length === 0 && <p className="text-muted-foreground">אין כרגע פרויקטים ציבוריים פעילים</p>}
      <ul className="divide-y divide-border">{projects.data?.map(project => <li key={project.id} className="flex items-start gap-3 py-4">{project.image_url && <img src={project.image_url} alt={project.name} className="h-24 w-28 shrink-0 rounded-md object-cover" loading="lazy" />}<div className="min-w-0 space-y-1"><h3 className="break-words text-lg font-bold">{project.name}</h3><p className="text-muted-foreground">{[project.city, project.address].filter(Boolean).join(' · ')}</p>{project.price_from != null && <p className="font-semibold">החל מ־₪{project.price_from.toLocaleString('he-IL')}</p>}{project.description && <p className="whitespace-pre-line break-words text-base">{project.description}</p>}{project.delivery_date && <p className="text-sm text-muted-foreground">מסירה: {project.delivery_date}</p>}</div></li>)}</ul>
    </section>}
    {p && <section className="space-y-3">
      <div className="flex items-center justify-between gap-2"><h2 className="min-w-0 text-xl font-bold">{listingIds.isLoading || feed.isLoading || listingIds.isError || feed.isError ? '' : `${cards.length} `}נכסים פעילים לשיתוף פעולה</h2>
        <ViewModeSwitch isGrid={view === 'grid'} className="!h-11 !w-11" onToggle={() => { setView(current => current === 'list' ? 'grid' : 'list'); setExpandedId(null); }} />
      </div>
      {(listingIds.isLoading || feed.isLoading) && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />}
      {(listingIds.isError || feed.isError) && <p role="alert" className="text-destructive">טעינת הנכסים נכשלה</p>}
      {listingIds.data && feed.data && !cards.length && <p className="text-muted-foreground">אין כרגע נכסים פעילים</p>}
      <div className={view === 'grid' ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'mx-auto grid max-w-2xl grid-cols-1 gap-4'}>{cards.map(card => {
        const title = publicAdTitle(card);
        const fav = favorites.favoriteIds.has(card.id);
        const expanded = view === 'list' && expandedId === card.id;
        const toggleFavorite = () => void favorites.toggleFavorite(card.id);
        return <div key={card.id} className={view === 'list' ? 'min-w-0 [&>article]:h-auto' : 'min-w-0'}>
          <StandardPropertyCard card={card} signedIn isMine={user?.id === userId} isFav={fav} onFavorite={toggleFavorite}
            onOpen={view === 'list' ? () => setExpandedId(current => current === card.id ? null : card.id) : undefined}
            expanded={view === 'list' ? expanded : undefined}
            menu={<ProfileAssetMenu card={card} title={title} isOwner={isOwner} isFav={fav} onFavorite={toggleFavorite} />} />
          <AnimatedExpansion open={expanded} id={`profile-property-${card.id}`}>
            <div className="py-5" data-profile-property-details={card.id}>
              <ExpandedPropertyDetails idOrSlug={card.id} isFav={fav} onFavorite={toggleFavorite} onClose={() => setExpandedId(null)} />
            </div>
          </AnimatedExpansion>
        </div>;
      })}</div>
    </section>}
  </main>;
}
