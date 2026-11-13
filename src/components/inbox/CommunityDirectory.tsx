import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
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
        const body = <><Avatar className="h-9 w-9 shrink-0"><AvatarImage src={u.avatar_url ?? undefined} /><AvatarFallback>{u.full_name?.charAt(0)}</AvatarFallback></Avatar>
          <span className="min-w-0 flex-1 truncate text-start">{u.full_name}</span>
          <Badge variant="secondary" className="shrink-0">{ROLE_BADGE[u.category] ?? 'משתמש'}</Badge></>;
        return onSelect
          ? <Button key={u.id} type="button" variant="ghost" className="h-auto min-h-12 w-full justify-start gap-3 px-2" onClick={() => onSelect(u)}>{body}</Button>
          : <div key={u.id} className="flex min-h-12 items-center gap-3 px-1">{renderAction?.(u)}{body}</div>;
      })}
    </div>
  </div>;
}
