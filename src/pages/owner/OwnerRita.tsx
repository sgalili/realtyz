import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Turn = { role: 'rita' | 'owner'; text: string };

/** Private owner screen: a direct chat with Rita about their own properties. */
export default function OwnerRita() {
  const [turns, setTurns] = useState<Turn[]>([
    { role: 'rita', text: 'היי, אני ריטה. אפשר לשאול אותי על הנכסים שלכם, על המתעניינים ועל התגמולים לשותפים.' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [turns]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setTurns((t) => [...t, { role: 'owner', text }]);
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-agent', {
        body: {
          messages: [
            ...turns.map((t) => ({ role: t.role === 'rita' ? 'assistant' : 'user', content: t.text })),
            { role: 'user', content: text },
          ],
        },
      });
      if (error) throw error;
      const reply = (data as any)?.content;
      setTurns((t) => [...t, { role: 'rita', text: reply ? String(reply) : 'לא הצלחתי לענות כרגע, ננסה שוב.' }]);
    } catch {
      toast.error('ריטה אינה זמינה כרגע');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="flex h-[calc(100vh-180px)] flex-col gap-3">
      <header>
        <h1 className="text-xl font-bold text-foreground">צ׳אט עם ריטה</h1>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto rounded-xl border bg-card p-3">
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
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
          placeholder="כתבו לריטה"
        />
        <Button onClick={() => void send()} disabled={busy} aria-label="שליחה"><Send className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
