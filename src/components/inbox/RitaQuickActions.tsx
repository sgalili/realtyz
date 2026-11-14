import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, CalendarClock, Check, Home, Loader2, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function RitaQuickActions({ interaction, kind, target }: { interaction: string; kind: 'lead' | 'peer' | 'group'; target: string }) {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState<string | null>(null);
  const actions = useQuery({ queryKey: ['rita-actions', interaction], queryFn: async () => {
    const { data, error } = await supabase.from('rita_conversation_actions').select('id,kind,label,status,result').eq('interaction_id', interaction).order('created_at');
    if (error) throw error;
    return data;
  } });
  const execute = async (id: string) => {
    if (running) return;
    setRunning(id);
    try {
      const { data, error } = await supabase.functions.invoke('rita-conversation', { body: { kind, target, action: 'reply', interaction_id: interaction, execute_action_id: id } });
      if (error) {
        const detail = 'context' in error && error.context instanceof Response ? await error.context.json().catch(() => ({})) : {};
        throw new Error(detail.error ?? 'הפעולה לא הושלמה');
      }
      if (!data?.success) throw new Error('הפעולה לא הושלמה');
      toast.success(data.message);
      await Promise.all(['rita-conversations', 'chat-messages', 'inbox-leads', 'last-messages', 'command-center-tasks', 'deal-room-leads'].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
    } catch (error) { toast.error(error instanceof Error ? error.message : 'הפעולה נכשלה'); }
    finally { setRunning(null); await actions.refetch(); }
  };
  return <div className="flex flex-wrap gap-2">
    {actions.data?.map(action => {
      const Icon = action.kind === 'schedule_followup' ? CalendarClock : action.kind === 'send_property' ? Home : action.kind === 'advance_lead' ? ArrowUpRight : Send;
      const result = action.result && typeof action.result === 'object' && !Array.isArray(action.result) ? action.result : null;
      return <Button key={action.id} size="sm" variant="outline" className="gap-2" disabled={!!running || action.status !== 'pending'} onClick={() => void execute(action.id)} title={typeof result?.message === 'string' ? result.message : action.label}>
        {running === action.id || action.status === 'running' ? <Loader2 className="h-4 w-4 animate-spin" /> : action.status === 'completed' ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        {action.label}{action.status === 'failed' ? ' · לא הושלם' : ''}
      </Button>;
    })}
  </div>;
}