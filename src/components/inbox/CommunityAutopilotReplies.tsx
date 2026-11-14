import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ChatMessageText } from './ChatMessageText';
import { RitaAvatar } from '@/components/RitaAvatar';
import { RitaQuickActions } from './RitaQuickActions';

export function CommunityAutopilotReplies({ kind, target }: { kind: 'peer' | 'group'; target: string }) {
  const { user } = useAuth();
  const logs = useQuery({ queryKey: ['rita-conversations', kind, target, 'automatic', user?.id], enabled: !!user, refetchInterval: 3000, queryFn: async () => {
    if (!user) return [];
    let query = supabase.from('rita_chat_interactions').select('id,response,status,error_message,created_at').or('delivered.eq.true,source_message_id.not.is.null').order('created_at').limit(100);
    query = kind === 'group' ? query.eq('group_id', target) : query.or(`and(requested_by.eq.${user.id},peer_id.eq.${target}),and(requested_by.eq.${target},peer_id.eq.${user.id})`);
    const { data, error } = await query; if (error) throw error; return data;
  } });
  return <>{logs.data?.map(log => <div key={log.id} className="mb-3 flex justify-start"><div className="max-w-[80%] space-y-2 rounded-lg bg-primary px-3 py-2 text-primary-foreground"><span className="mb-1 flex items-center gap-2 font-semibold"><RitaAvatar className="h-6 w-6" />ריטה</span>{log.status === 'completed' ? <><ChatMessageText content={log.response} /><RitaQuickActions interaction={log.id} kind={kind} target={target} /></> : <span className="text-sm">{log.status === 'pending' ? 'ריטה חושבת…' : log.error_message ?? 'ריטה לא הצליחה להשיב'}</span>}<time className="mt-1 block text-end text-xs opacity-70">{new Date(log.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</time></div></div>)}</>;
}