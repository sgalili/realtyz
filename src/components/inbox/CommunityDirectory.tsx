import { useState } from 'react';
import { CommunityProfileDialog } from './CommunityProfileDialog';
import { useQuery } from '@tanstack/react-query';
import { Loader2, MessageCircle, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export type DirectoryUser = { id: string; full_name: string | null; avatar_url: string | null; category: string };
export const DIRECTORY_CATEGORIES = [
  { value: 'all', label: 'הכול' }, { value: 'broker', label: 'מתווכים' },
  { value: 'developer', label: 'יזמים' }, { value: 'partner', label: 'שותפים' },
] as const;
export const ROLE_BADGE: Record<string, string> = { broker: 'מתווך', developer: 'יזם', partner: 'שותף', buyer: 'קונה', seller: 'מוכר', dealer: 'סוחר', landlord: 'משכיר' };

export function useCommunityDirectory(enabled: boolean, search: string, category: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['community-directory', user?.id, search, category], enabled: enabled && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_directory', { _search: search, _category: category });
      if (error) throw error;
      return data as DirectoryUser[];
    },
  });
}

export function CommunityDirectory({ enabled, exclude = [], renderAction, onSelect, listClassName = 'max-h-64' }: {
  enabled: boolean; exclude?: string[];
  renderAction?: (u: DirectoryUser) => React.ReactNode; onSelect?: (u: DirectoryUser) => void; listClassName?: string;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [profileId, setProfileId] = useState<string | null>(null);
  const directory = useCommunityDirectory(enabled, search, category);
  const rows = (directory.data ?? []).filter(u => !exclude.includes(u.id));
  return <div className="space-y-2">
    <div className="relative"><Search className="absolute end-3 top-3 h-4 w-4 text-muted-foreground" />
      <Input aria-label="חיפוש במדריך המשתמשים" placeholder="חיפוש משתמשים במערכת..." className="pe-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
    <div className="flex flex-wrap gap-1.5">{DIRECTORY_CATEGORIES.map(c => <Button key={c.value} type="button" size="sm" variant={category === c.value ? 'default' : 'outline'} className="h-8 rounded-full px-3" onClick={() => setCategory(c.value)}>{c.label}</Button>)}</div>
    <div className={`${listClassName} overflow-y-auto`}>
      {directory.isLoading && <Loader2 className="mx-auto my-3 h-5 w-5 animate-spin text-muted-foreground" />}
      {directory.isError && <p role="alert" className="text-destructive">טעינת המדריך נכשלה</p>}
      {!directory.isLoading && !directory.isError && !rows.length && <p className="py-3 text-sm text-muted-foreground">לא נמצאו משתמשים</p>}
      {rows.map(u => {
        const name = u.full_name ?? 'משתמש';
        const identity = <><Avatar className="h-9 w-9 shrink-0"><AvatarImage src={u.avatar_url ?? undefined} /><AvatarFallback>{u.full_name?.charAt(0)}</AvatarFallback></Avatar>
          <span className="min-w-0 flex-1 truncate text-start underline-offset-2 group-hover:underline">{u.full_name}</span>
          <Badge variant="secondary" className="shrink-0">{ROLE_BADGE[u.category] ?? 'משתמש'}</Badge></>;
        const openProfile = <button key={u.id} type="button" className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-start hover:bg-muted" aria-label={`פתיחת הפרופיל הציבורי של ${name}`} title="פתיחת הפרופיל הציבורי" onClick={() => setProfileId(u.id)}>{identity}</button>;
        if (onSelect) return <div key={u.id} className="flex min-h-12 items-center gap-2 px-1">
          {openProfile}
          <Button type="button" size="sm" variant="outline" className="h-9 shrink-0 gap-1.5 rounded-full px-3" aria-label={`פתיחת שיחה עם ${name}`} onClick={() => onSelect(u)}><MessageCircle className="h-4 w-4" />שיחה</Button>
        </div>;
        return <div key={u.id} className="flex min-h-12 items-center gap-2 px-1">{renderAction?.(u)}{openProfile}</div>;
      })}
    </div>
    <CommunityProfileDialog userId={profileId} onOpenChange={open => { if (!open) setProfileId(null); }} />
  </div>;
}
