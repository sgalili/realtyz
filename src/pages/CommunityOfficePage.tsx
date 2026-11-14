import { ProfilePageClose } from '@/components/community/ProfilePageClose';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { professionalRole } from '../../supabase/functions/_shared/personalLanguage';
import { useCommunityGenders } from '@/hooks/useCommunityGenders';
import { fetchPublicBoardFeed } from '@/lib/publicBoardFeed';

export default function CommunityOfficePage() {
  const { userId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
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
      return { memberId: member.id, ids: new Set((data ?? []).map(listing => listing.id)) };
    }));
    const feed = await fetchPublicBoardFeed();
    return new Map(results.map(result => [result.memberId, feed.filter(card => result.ids.has(card.id)).length]));
  } });
  const close = () => window.history.state?.idx > 0 ? navigate(-1) : navigate('/');
  return <main dir="rtl" data-no-hero-wave className="relative mx-auto max-w-6xl space-y-6 pb-6">
    <ProfilePageClose onClose={close} />
    <div className="flex items-center gap-3 ps-12">{profile.data?.logo_url && <img src={profile.data.logo_url} alt={profile.data.office_name ?? 'לוגו משרד'} className="h-16 w-16 shrink-0 object-contain" />}<h1 className="min-w-0 break-words text-2xl font-bold">{profile.data?.office_name ?? members.data?.[0]?.office_name ?? 'צוות המשרד'}</h1></div>
    {members.isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
    {members.isError && <p role="alert" className="text-destructive">טעינת צוות המשרד נכשלה</p>}
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">{members.data?.map(member => <li key={member.id}><Button variant="outline" className="h-full min-h-40 w-full flex-col justify-start gap-2 whitespace-normal rounded-md p-3 text-center" onClick={() => navigate(`/community/profile/${encodeURIComponent(member.id)}`, { state: { agencyId: userId } })}><Avatar className="h-16 w-16 shrink-0"><AvatarImage src={member.avatar_url ?? undefined} alt={member.full_name ?? ''} /><AvatarFallback>{member.full_name?.slice(0, 1)}</AvatarFallback></Avatar><span className="w-full break-words text-base font-semibold">{member.full_name}</span><span className="text-sm text-muted-foreground">{professionalRole(member.category, genders.data?.get(member.id) ?? null)}</span><span className="mt-auto text-base">{assets.isLoading ? '…' : assets.isError ? 'הספירה אינה זמינה' : `${assets.data?.get(member.id) ?? 0} נכסים`}</span></Button></li>)}</ul>
    {members.data?.length === 0 && <p className="text-muted-foreground">לא נמצא צוות משרד משותף</p>}
    {assets.isError && <p role="alert" className="text-destructive">טעינת ספירת הנכסים נכשלה</p>}
  </main>;
}