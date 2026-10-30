import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Maximize2, Trash2, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { RitaAvatar } from '@/components/RitaAvatar';
import { useRitaWorkspaceIdentity } from '@/hooks/useRitaWorkspaceIdentity';
import { cn } from '@/lib/utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type MiniMsg = { role: string; content: string };

/**
 * Rita's mini chat at the bottom of the sidebar: a compact control row
 * (clear, collapse/expand and full view) above one thin-bordered row holding
 * her photo, the question field and the send arrow, separated from the menu
 * above by a single hairline. Tapping Rita's photo opens the same conversation
 * full screen as well.
 */
export function SidebarRitaChat() {
  const identity = useRitaWorkspaceIdentity();
  return <ScopedSidebarRitaChat key={identity.scope} identity={identity} />;
}

function ScopedSidebarRitaChat({ identity }: { identity: ReturnType<typeof useRitaWorkspaceIdentity> }) {
  const { scope, firstName, ready } = identity;
  const cache = useQueryClient();
  const [messages, setMessages] = useState<MiniMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => { void cache.invalidateQueries({ queryKey: ['rita-workspace-identity'] }); };
    window.addEventListener('realtyz:profile-saved', refresh);
    return () => window.removeEventListener('realtyz:profile-saved', refresh);
  }, [cache]);

  useEffect(() => {
    const onState = (e: Event) => {
      const d = (e as CustomEvent<{ scope: string; messages: MiniMsg[]; loading: boolean }>).detail;
      if (!scope || d?.scope !== scope) return;
      setMessages(d?.messages ?? []);
      setLoading(!!d?.loading);
    };
    window.addEventListener('rita:state', onState);
    window.dispatchEvent(new Event('rita:state-request'));
    return () => window.removeEventListener('rita:state', onState);
  }, [scope]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages, loading, collapsed]);

  const placeholder = firstName
    ? `היי ${firstName}, איך אני יכולה לעזור?`
    : 'היי, איך אני יכולה לעזור?';

  const openFull = () => window.dispatchEvent(new CustomEvent('open-ai-drawer', { detail: { expanded: true } }));

  const clearChat = () => {
    setMessages([]);
    setCollapsed(false);
    window.dispatchEvent(new CustomEvent('rita:clear', { detail: { scope } }));
  };

  const send = () => {
    const t = text.trim();
    if (!t || loading || !ready) return;
    window.dispatchEvent(new CustomEvent('rita:send', { detail: { text: t, scope } }));
    setText('');
  };

  const iconBtn = 'rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <div dir="rtl" className="px-2 pb-2 pt-1.5">
      <div className="flex items-center justify-between px-0.5 pb-1">
        <button type="button" onClick={openFull} aria-label="פתיחת ריטה במסך מלא" title="מסך מלא" className={iconBtn}>
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <div className="flex flex-row-reverse items-center gap-0.5">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            disabled={messages.length === 0 && !loading}
            aria-label={collapsed ? 'הרחבת צ׳אט' : 'צמצום צ׳אט'}
            title={collapsed ? 'הרחבה' : 'צמצום'}
            className={iconBtn}
          >
            {collapsed ? <ChevronsUpDown className="h-3.5 w-3.5" /> : <ChevronsDownUp className="h-3.5 w-3.5" />}
          </button>
          {/* The reset control only exists once there is a conversation to reset. */}
          {messages.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  aria-label="איפוס צ׳אט"
                  title="איפוס צ׳אט"
                  className={iconBtn}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-[19px]">לאפס את הצ׳אט?</AlertDialogTitle>
                  <AlertDialogDescription className="text-[15px]">
                    כל היסטוריית השיחה עם ריטה תימחק לצמיתות.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="sm:justify-between">
                  <AlertDialogCancel>ביטול</AlertDialogCancel>
                  <AlertDialogAction onClick={clearChat}>איפוס</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
      {(messages.length > 0 || loading) && !collapsed && (
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
          className="min-w-0 flex-1 bg-transparent py-1 text-[16px] text-foreground outline-none placeholder:text-[16px] placeholder:text-muted-foreground" />
        <Button type="submit" size="icon" disabled={!text.trim() || loading || !ready} className="h-7 w-7 shrink-0 rounded-full" aria-label="שליחה">
          <ArrowUp className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
