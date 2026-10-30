import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRitaWorkspaceIdentity } from '@/hooks/useRitaWorkspaceIdentity';

type Turn = { role: 'rita' | 'owner'; text: string };

/** Private owner screen: a direct chat with Rita about their own properties. */
export default function OwnerRita() {
  const identity = useRitaWorkspaceIdentity();
  return <ScopedOwnerRita key={identity.scope} identity={identity} />;
}

function ScopedOwnerRita({ identity }: { identity: ReturnType<typeof useRitaWorkspaceIdentity> }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [turns]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy || !identity.ready) return;
    setInput('');
    setTurns((t) => [...t, { role: 'owner', text }]);
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-agent', {
        body: {
          expected_workspace_owner_id: identity.ownerId,
          messages: [
            ...turns.map((t) => ({ role: t.role === 'rita' ? 'assistant' : 'user', content: t.text })),
            { role: 'user', content: text },
          ],
        },
      });
      if (!mounted.current) return;
      if (error) throw error;
      const reply = (data as any)?.content;
      setTurns((t) => [...t, { role: 'rita', text: reply ? String(reply) : 'לא הצלחתי לענות כרגע, ננסה שוב.' }]);
    } catch {
      if (mounted.current) toast.error('ריטה אינה זמינה כרגע');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="flex h-full min-h-[60svh] flex-col gap-3 pb-2">
      <header>
        <h1 className="text-xl font-bold text-foreground">צ׳אט עם ריטה</h1>
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain rounded-xl border bg-card p-3">
        {turns.length === 0 && <p className="text-foreground">{identity.firstName ? `היי ${identity.firstName}, אני ריטה` : 'היי, אני ריטה'}</p>}
        {turns.map((t, i) => (
          <p
            key={i}
            className={`max-w-[85%] break-words rounded-lg px-3 py-2 text-sm ${
              t.role === 'rita' ? 'bg-muted text-foreground' : 'ms-auto bg-primary text-primary-foreground'
            }`}
            style={{ overflowWrap: 'anywhere' }}
          >
            {t.text}
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex shrink-0 items-end gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
          placeholder="כתבו לריטה"
        />
        <Button onClick={() => void send()} disabled={busy || !identity.ready} aria-label="שליחה"><Send className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
