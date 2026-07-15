import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Bot } from 'lucide-react';
import { useDemoMode } from '@/hooks/useDemoMode';
import { DEMO_MESSAGES } from '@/lib/demoData';

const AiMessageCounter = () => {
  const { isDemoMode } = useDemoMode();
  const { data: count } = useQuery({
    queryKey: ['ai-messages-today'],
    enabled: !isDemoMode,
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from('chat_history')
        .select('*', { count: 'exact', head: true })
        .in('role', ['assistant', 'ai'])
        .gte('created_at', todayStart.toISOString());
      return count ?? 0;
    },
    refetchInterval: 300_000,
    staleTime: 300_000,
  });

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
      <Bot className="h-4 w-4 text-primary" />
      <span className="text-sm font-semibold text-primary">{isDemoMode ? DEMO_MESSAGES.filter((m) => m.role === 'assistant').length : (count ?? 0)}</span>
      <span className="text-xs text-muted-foreground">הודעות AI היום</span>
    </div>
  );
};

export default AiMessageCounter;
