import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RitaAvatar } from '@/components/RitaAvatar';
import { GeminiIcon } from '@/components/GeminiIcon';
import { cn } from '@/lib/utils';

type MiniMsg = { role: string; content: string };

/**
 * Gemini-style mini chat at the bottom of the sidebar. It talks to the same
 * Rita conversation as the full drawer (same persona, brain and workspace
 * scope), and the expand button opens that conversation in a large window.
 */
export function SidebarRitaChat() {
  const [messages, setMessages] = useState<MiniMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onState = (e: Event) => {
      const d = (e as CustomEvent<{ messages: MiniMsg[]; loading: boolean }>).detail;
      setMessages(d?.messages ?? []);
      setLoading(!!d?.loading);
    };
    window.addEventListener('rita:state', onState);
    window.dispatchEvent(new Event('rita:state-request'));
    return () => window.removeEventListener('rita:state', onState);
  }, []);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages, loading]);

  const send = () => {
    const t = text.trim();
    if (!t || loading) return;
    window.dispatchEvent(new CustomEvent('rita:send', { detail: { text: t } }));
    setText('');
  };

  return (
    <div dir="rtl" className="mx-2 mb-2 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <RitaAvatar className="h-7 w-7" />
        <span className="flex-1 text-sm font-semibold text-foreground">ריטה</span>
        <GeminiIcon className="h-4 w-4" />
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7 rounded-full" aria-label="פתיחת ריטה במסך מלא" title="מסך מלא"
          onClick={() => window.dispatchEvent(new CustomEvent('open-ai-drawer', { detail: { expanded: true } }))}>
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div ref={listRef} className="max-h-40 space-y-1.5 overflow-y-auto px-3 py-2 text-xs">
        {messages.length === 0 && !loading && <p className="bg-gradient-to-l from-primary to-accent-foreground bg-clip-text text-[15px] font-semibold text-transparent">היי, במה אפשר לעזור?</p>}
        {messages.map((m, i) => (
          <p key={i} className={cn('line-clamp-4 whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5', m.role === 'user' ? 'ms-6 bg-muted text-foreground' : 'text-foreground')}>{m.content}</p>
        ))}
        {loading && <p className="animate-pulse text-muted-foreground">ריטה חושבת…</p>}
      </div>
      <form className="m-2 mt-0 flex items-end gap-1 rounded-full bg-muted px-3 py-1.5" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="שאלו את ריטה" aria-label="הודעה לריטה"
          className="min-w-0 flex-1 bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground" />
        <Button type="submit" size="icon" disabled={!text.trim() || loading} className="h-7 w-7 shrink-0 rounded-full" aria-label="שליחה">
          <ArrowUp className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
