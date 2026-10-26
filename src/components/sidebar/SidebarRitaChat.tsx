import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { RitaAvatar } from '@/components/RitaAvatar';
import { useAuth } from '@/hooks/useAuth';
import { friendlyUserDisplayName } from '@/lib/friendlyUserDisplayName';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type MiniMsg = { role: string; content: string };

/**
 * Rita's mini chat at the bottom of the sidebar: one thin-bordered row holding
 * her photo, the question field and the send arrow, separated from the menu
 * above by a single hairline. Tapping Rita's photo opens the same conversation
 * full screen, so no extra expand control is needed in the row.
 */
export function SidebarRitaChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<MiniMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // The greeting addresses the signed-in person by their own first name.
  const { data: profile } = useQuery({
    queryKey: ['app-header-user-profile', user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      return (data as { full_name?: string | null } | null) ?? null;
    },
  });

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

  const fullName = (profile?.full_name?.trim() || friendlyUserDisplayName(user, '')).trim();
  const firstName = fullName.split(/\s+/).filter(Boolean)[0] ?? '';
  const placeholder = firstName
    ? `היי ${firstName}, כאן ריטה, איך אני יכולה לעזור?`
    : 'היי, כאן ריטה, איך אני יכולה לעזור?';

  const openFull = () => window.dispatchEvent(new CustomEvent('open-ai-drawer', { detail: { expanded: true } }));

  const send = () => {
    const t = text.trim();
    if (!t || loading) return;
    window.dispatchEvent(new CustomEvent('rita:send', { detail: { text: t } }));
    setText('');
  };

  return (
    <div dir="rtl" className="px-2 pb-2 pt-1.5">
      {(messages.length > 0 || loading) && (
        <div ref={listRef} className="max-h-40 space-y-1.5 overflow-y-auto px-1 pb-2 text-xs">
          {messages.map((m, i) => (
            <p key={i} className={cn('line-clamp-4 whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5', m.role === 'user' ? 'ms-6 bg-muted text-foreground' : 'text-foreground')}>{m.content}</p>
          ))}
          {loading && <p className="animate-pulse text-muted-foreground">ריטה חושבת…</p>}
        </div>
      )}
      <form
        className="flex items-center gap-1.5 rounded-full border border-border bg-background px-1.5 py-1"
        onSubmit={(e) => { e.preventDefault(); send(); }}
      >
        <button type="button" onClick={openFull} aria-label="פתיחת ריטה במסך מלא" title="מסך מלא" className="shrink-0 rounded-full">
          <RitaAvatar className="h-7 w-7 ring-0" />
        </button>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label="הודעה לריטה"
          className="min-w-0 flex-1 bg-transparent py-1 text-xs text-foreground outline-none placeholder:text-[10px] placeholder:text-muted-foreground" />
        <Button type="submit" size="icon" disabled={!text.trim() || loading} className="h-7 w-7 shrink-0 rounded-full" aria-label="שליחה">
          <ArrowUp className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
