import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { professionalRole } from '../../supabase/functions/_shared/personalLanguage';
import { useCommunityGenders } from '@/hooks/useCommunityGenders';
import { fetchPublicBoardFeed } from '@/lib/publicBoardFeed';
import { useListingFavorites } from '@/hooks/useListingFavorites';
import StandardPropertyCard from '@/components/public/StandardPropertyCard';

export default function CommunityOfficePage() {
  const { userId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const favorites = useListingFavorites();
  const profile = useQuery({ queryKey: ['community-office-profile', user?.id, userId], enabled: !!user && !!userId, queryFn: async () => {
    const { data, error } = await supabase.rpc('community_profile_page', { _user: userId });
    if (error) throw error;
    return data?.[0] ?? null;
  } });
  const members = useQuery({ queryKey: ['community-office-roster', user?.id, userId], enabled: !!user && !!userId, queryFn: async () => {
    const { data, error } = await supabase.rpc('community_office_members', { _user: userId });
    if (error) throw error;
    if (data?.length) return data;
    // A known office without a matched roster still has its saved profile owner.
    const { data: owner, error: ownerError } = await supabase.rpc('community_profile_page', { _user: userId });
    if (ownerError) throw ownerError;
    return owner ?? [];
  } });
  const genders = useCommunityGenders((members.data ?? []).map(member => member.id));
  const assets = useQuery({ queryKey: ['community-office-assets', user?.id, userId], enabled: !!members.data?.length, queryFn: async () => {
    const results = await Promise.all((members.data ?? []).map(async member => {
      const { data, error } = await supabase.rpc('community_profile_listings', { _user: member.id });
      if (error) throw error;
      return data ?? [];
    }));
    const ids = new Set(results.flat().map(l => l.id));
    return (await fetchPublicBoardFeed()).filter(card => ids.has(card.id));
  } });
  const close = () => window.history.state?.idx > 0 ? navigate(-1) : navigate('/');
  return <main dir="rtl" data-no-hero-wave className="relative mx-auto max-w-6xl space-y-6 pb-6">
    <Button className="absolute left-0 top-0" size="icon" variant="ghost" aria-label="סגירה וחזרה לדף הקודם" onClick={close}><X className="h-5 w-5" /></Button>
    <div className="flex items-center gap-3 ps-12">{profile.data?.logo_url && <img src={profile.data.logo_url} alt={profile.data.office_name ?? 'לוגו משרד'} className="h-16 w-16 shrink-0 object-contain" />}<h1 className="min-w-0 break-words text-2xl font-bold">{profile.data?.office_name ?? members.data?.[0]?.office_name ?? 'צוות המשרד'}</h1></div>
    {members.isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
    {members.isError && <p role="alert" className="text-destructive">טעינת צוות המשרד נכשלה</p>}
    <ul className="divide-y divide-border">{members.data?.map(member => <li key={member.id}><Button variant="ghost" className="h-auto w-full justify-start gap-3 py-3 text-start" onClick={() => navigate(`/community/profile/${encodeURIComponent(member.id)}`)}><Avatar className="h-14 w-14"><AvatarImage src={member.avatar_url ?? undefined} /><AvatarFallback>{member.full_name?.slice(0, 1)}</AvatarFallback></Avatar><span className="min-w-0"><span className="block whitespace-normal text-lg font-semibold">{member.full_name}</span><span className="text-muted-foreground">{professionalRole(member.category, genders.data?.get(member.id) ?? null)} {member.license_number}</span></span></Button></li>)}</ul>
    {members.data?.length === 0 && <p className="text-muted-foreground">לא נמצא צוות משרד משותף</p>}
    <section className="space-y-3"><h2 className="text-xl font-bold">{assets.data?.length ?? ''} נכסים פעילים לשיתוף פעולה</h2>{assets.isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}{assets.isError && <p role="alert" className="text-destructive">טעינת הנכסים נכשלה</p>}<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{assets.data?.map(card => <StandardPropertyCard key={card.id} card={card} signedIn isFav={favorites.favoriteIds.has(card.id)} onFavorite={() => void favorites.toggleFavorite(card.id)} />)}</div></section>
  </main>;
}