import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useActiveWorkspaceOwnerId } from './useWorkspace';
import { toast } from 'sonner';

export type InboxFavoriteKind = 'lead' | 'message' | 'peer' | 'peer_message' | 'group';
export function useInboxFavorites() {
  const { user } = useAuth();
  const workspace = useActiveWorkspaceOwnerId();
  const client = useQueryClient();
  const key = ['inbox-favorites', user?.id, workspace];
  const query = useQuery({ queryKey: key, enabled: !!user && !!workspace, queryFn: async () => {
    if (!user || !workspace) return [];
    const { data, error } = await supabase.from('inbox_favorites').select('*').eq('user_id', user.id).eq('workspace_owner_id', workspace).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  } });
  const has = (kind: InboxFavoriteKind, id: string) => !!query.data?.some(row => row.target_kind === kind && row.target_id === id);
  const toggle = async (kind: InboxFavoriteKind, id: string) => {
    if (!user || !workspace || !/^[0-9a-f-]{36}$/i.test(id)) return false;
    const remove = has(kind, id);
    const result = remove
      ? await supabase.from('inbox_favorites').delete().eq('user_id', user.id).eq('workspace_owner_id', workspace).eq('target_kind', kind).eq('target_id', id)
      : await supabase.from('inbox_favorites').insert({ user_id: user.id, workspace_owner_id: workspace, target_kind: kind, target_id: id });
    if (result.error) { toast.error('שמירת המועדף נכשלה'); return false; }
    await client.invalidateQueries({ queryKey: key });
    return true;
  };
  return { ...query, has, toggle };
}