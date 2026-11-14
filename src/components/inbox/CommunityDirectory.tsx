import { useState } from 'react';
import { CommunityProfileDialog } from './CommunityProfileDialog';
import { ChatHeaderActions } from './ChatHeaderActions';
import { CommunityPeerActions } from './CommunityPeerActions';
import { useQuery } from '@tanstack/react-query';
import { Loader2, MessageCircle, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ClearFilterButton } from '@/components/ui/clear-filter-button';
import { useCommunityGenders } from '@/hooks/useCommunityGenders';
import { professionalRole } from '../../../supabase/functions/_shared/personalLanguage';

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
  const genders = useCommunityGenders(rows.map(u => u.id));
  return <div className="space-y-2">
    <ClearFilterButton active={!!search.trim() || category !== 'all'} onClear={() => { setSearch(''); setCategory('all'); }} />
    <div className="relative"><Search className="absolute end-3 top-3 h-4 w-4 text-muted-foreground" />
      <Input aria-label="חיפוש במדריך המשתמשים" placeholder="חיפוש משתמשים במערכת..." className="pe-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
    <div className="flex flex-wrap gap-1.5">{DIRECTORY_CATEGORIES.map(c => <Button key={c.value} type="button" size="sm" variant={category === c.value ? 'default' : 'outline'} className="h-8 rounded-full px-3" onClick={() => setCategory(c.value)}>{c.label}</Button>)}</div>
    <div className={`${listClassName} overflow-y-auto`}>
      {directory.isLoading && <Loader2 className="mx-auto my-3 h-5 w-5 animate-spin text-muted-foreground" />}
      {directory.isError && <p role="alert" className="text-destructive">טעינת המדריך נכשלה</p>}
      {!directory.isLoading && !directory.isError && !rows.length && <p className="py-3 text-sm text-muted-foreground">לא נמצאו משתמשים</p>}
      {rows.map(u => {
        const name = u.full_name ?? 'משתמש';
        return <div key={u.id} data-directory-card className="relative flex min-h-14 items-center gap-3 border-b border-border px-1 py-2 pl-14">
          {renderAction?.(u)}
          <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-full p-0" aria-label={`פתיחת הפרופיל הציבורי של ${name}`} onClick={() => setProfileId(u.id)}><Avatar className="h-10 w-10"><AvatarImage src={u.avatar_url ?? undefined} /><AvatarFallback>{u.full_name?.charAt(0)}</AvatarFallback></Avatar></Button>
          {onSelect ? <Button type="button" variant="ghost" className="h-auto min-w-0 flex-1 justify-start px-0 text-start" aria-label={`פתיחת שיחה עם ${name}`} onClick={() => onSelect(u)}><span className="truncate">{u.full_name}</span></Button> : <span className="min-w-0 flex-1 truncate text-start">{u.full_name}</span>}
          <Badge variant="secondary" className="shrink-0">{professionalRole(u.category, genders.data?.get(u.id) ?? null)}</Badge>
          <div className="absolute left-1 top-1"><ChatHeaderActions label="פעולות כרטיס"><CommunityPeerActions id={u.id} name={u.full_name} /></ChatHeaderActions></div>
        </div>;
      })}
    </div>
    <CommunityProfileDialog userId={profileId} onOpenChange={open => { if (!open) setProfileId(null); }} />
  </div>;
}
