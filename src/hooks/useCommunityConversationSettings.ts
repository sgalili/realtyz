import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useState } from 'react';
import { toast } from 'sonner';

export function useCommunityConversationSettings(kind: 'peer' | 'group') {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['community-conversation-settings', user?.id, kind], enabled: !!user, refetchInterval: 15000, queryFn: async () => {
    const { data, error } = await supabase.from('community_conversation_settings').select('*').eq('kind', kind);
    if (error) throw error;
    return data;
  } });
  const change = async (target: string, action: 'hide' | 'autopilot' | 'restore', enabled = false) => {
    if (busy) return false;
    setBusy(target);
    try {
      const { error } = await supabase.rpc('set_community_conversation_setting', { _kind: kind, _target: target, _action: action, _enabled: enabled });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['community-conversation-settings', user?.id, kind] });
      return true;
    } catch { toast.error('עדכון השיחה נכשל'); return false; }
    finally { setBusy(null); }
  };
  return { query, busy, change, enabled: (id: string) => query.data?.some(row => row.target_id === id && row.autopilot && !row.hidden_at) ?? false, hidden: (id: string, latest?: string) => { const row = query.data?.find(row => row.target_id === id); return !!row?.hidden_at && (!latest || Date.parse(latest) <= Date.parse(row.hidden_at)); } };
}