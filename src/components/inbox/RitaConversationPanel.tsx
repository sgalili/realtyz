import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, ListChecks, Send, Square, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RitaAvatar } from '@/components/RitaAvatar';
import { ChatMessageText } from './ChatMessageText';

export type RitaConversationKind = 'peer' | 'group' | 'lead';
export function RitaConversationPanel({ kind, target }: { kind: RitaConversationKind; target: string }) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [thinking, setThinking] = useState('');
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();
  useEffect(() => () => controller.current?.abort(), []);
  const logs = useQuery({
    queryKey: ['rita-conversations', kind, target], refetchInterval: 15000,
    queryFn: async () => {
      const column = kind === 'group' ? 'group_id' : kind === 'lead' ? 'lead_id' : 'peer_id';
      let query = supabase.from('rita_chat_interactions').select('id,prompt,response,status,created_at,requested_by,peer_id,action').order('created_at', { ascending: false }).limit(20);
      if (kind === 'peer') {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        query = query.or(`and(requested_by.eq.${user.id},peer_id.eq.${target}),and(requested_by.eq.${target},peer_id.eq.${user.id})`);
      } else query = query.eq(column, target);
      const { data, error } = await query;
      if (error) throw error;
      return data.reverse();
    },
  });
  const ask = async (action: 'reply' | 'summary' | 'lead') => {
    if (busy || (action === 'reply' && !prompt.trim())) return;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(''); setAnswer(''); setThinking('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('נדרשת כניסה מחדש');
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rita-conversation`, {
        method: 'POST', signal: abort.signal,
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, target, action, prompt }),
      });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error ?? 'ריטה לא הצליחה להשלים את הבקשה'); }
      if (!response.body) throw new Error('לא התקבלה תשובה');
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      let done = false;
      while (true) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value, { stream: !chunk.done });
        const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === 'text') setAnswer(previous => previous + event.text);
          if (event.type === 'reasoning') setThinking(previous => previous + event.text);
          if (event.type === 'error') throw new Error(event.message);
          if (event.type === 'done') done = true;
        }
        if (chunk.done) break;
      }
      if (!done) throw new Error('הבקשה לא הושלמה');
      setPrompt(''); setAnswer(''); setThinking('');
      await queryClient.invalidateQueries({ queryKey: ['rita-conversations'] });
    } catch (err) { if (!abort.signal.aborted) setError(err instanceof Error ? err.message : 'הבקשה נכשלה'); }
    finally { setBusy(false); controller.current = null; }
  };
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-3">
      <RitaAvatar className="h-9 w-9" /><span className="font-semibold">ריטה</span>
      <Button size="sm" variant="outline" className="ms-auto gap-1" disabled={busy} onClick={() => void ask('summary')}><ListChecks className="h-4 w-4" />סיכום</Button>
      <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => void ask('lead')}><Users className="h-4 w-4" />טיפול בליד</Button>
    </div>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" role="log" aria-label="תשובות ריטה">
      {logs.isError && <p role="alert" className="text-sm text-destructive">טעינת השיחות עם ריטה נכשלה</p>}
      {!logs.isLoading && !logs.data?.length && !busy && <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground"><Bot className="h-8 w-8" /><span>ריטה בשיחה</span></div>}
      {logs.data?.filter(log => log.status === 'completed').map(log => <div key={log.id} className="space-y-2 border-b border-border pb-3">{log.prompt && <p className="break-words text-sm text-muted-foreground">{log.prompt}</p>}<ChatMessageText content={log.response} /></div>)}
      {thinking && <details className="text-sm text-muted-foreground"><summary>ריטה חושבת</summary><ChatMessageText content={thinking} /></details>}
      {answer && <ChatMessageText content={answer} />}
      {busy && !answer && <p className="animate-pulse text-sm text-muted-foreground">ריטה חושבת...</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
    <form className="flex shrink-0 gap-2 border-t border-border p-3" onSubmit={event => { event.preventDefault(); void ask('reply'); }}>
      <Input aria-label="בקשה לריטה" placeholder="בקשה לריטה..." value={prompt} maxLength={4000} disabled={busy} onChange={event => setPrompt(event.target.value)} className="min-w-0 flex-1" />
      {busy ? <Button type="button" size="icon" aria-label="עצירת ריטה" onClick={() => controller.current?.abort()}><Square className="h-4 w-4" /></Button> : <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-full bg-whatsapp-header text-whatsapp-header-foreground hover:bg-whatsapp-header/90" aria-label="שלח לריטה" disabled={!prompt.trim()}><Send className="h-5 w-5" /></Button>}
    </form>
  </div>;
}