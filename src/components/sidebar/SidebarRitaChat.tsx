import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, Maximize2, Trash2, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { RitaAvatar } from '@/components/RitaAvatar';
import { RitaUserAvatar } from '@/components/rita/RitaUserAvatar';
import { useRitaWorkspaceIdentity } from '@/hooks/useRitaWorkspaceIdentity';
import { cn } from '@/lib/utils';
import { ritaChatKeyAction } from '@/lib/ritaChatKeys';
import { RITA_CHAT_GREETING, resizeRitaTextarea } from '@/lib/ritaChatPresentation';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type MiniMsg = { role: string; content: string };

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
  const [keyboardInset, setKeyboardInset] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
  useEffect(() => { if (textareaRef.current) resizeRitaTextarea(textareaRef.current); }, [text]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const measure = () => {
      const inset = viewport ? Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height) : 0;
      setKeyboardInset(inset > 80 ? inset : 0);
    };
    measure();
    window.addEventListener('resize', measure);
    viewport?.addEventListener('resize', measure);
    viewport?.addEventListener('scroll', measure);
    return () => {
      window.removeEventListener('resize', measure);
      viewport?.removeEventListener('resize', measure);
      viewport?.removeEventListener('scroll', measure);
    };
  }, []);

  const placeholder = firstName ? `היי ${firstName}, איך אני יכולה לעזור?` : 'היי, איך אני יכולה לעזור?';
  const openFull = () => window.dispatchEvent(new CustomEvent('open-ai-drawer', { detail: { expanded: true } }));
  const clearChat = () => {
    setMessages([]);
    setCollapsed(false);
    window.dispatchEvent(new CustomEvent('rita:clear', { detail: { scope } }));
  };
  const send = () => {
    const value = text.trim();
    if (!value || loading || !ready) return;
    window.dispatchEvent(new CustomEvent('rita:send', { detail: { text: value, scope } }));
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = '';
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const action = ritaChatKeyAction({ key: event.key, metaKey: event.metaKey, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing });
    if (action === 'ignore') return;
    event.preventDefault();
    if (action === 'send') {
      send();
      return;
    }
    const textarea = event.currentTarget;
    textarea.setRangeText('\n', textarea.selectionStart, textarea.selectionEnd, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const iconBtn = 'rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <div dir="rtl" className="px-2 pb-2 pt-1.5" style={{ paddingBottom: 8 + keyboardInset }}>
      <div className="flex items-center gap-1 px-0.5 pb-1">
        <div className="flex shrink-0 items-center gap-0.5">
          {messages.length > 0 && <AlertDialog>
            <AlertDialogTrigger asChild>
              <button type="button" aria-label="איפוס צ׳אט" title="איפוס צ׳אט" className={iconBtn}><Trash2 className="h-3.5 w-3.5" /></button>
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-[19px]">לאפס את הצ׳אט?</AlertDialogTitle>
                <AlertDialogDescription className="text-[15px]">כל היסטוריית השיחה עם ריטה תימחק לצמיתות.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="sm:justify-between">
                <AlertDialogCancel>ביטול</AlertDialogCancel>
                <AlertDialogAction onClick={clearChat}>איפוס</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>}
          <button type="button" onClick={openFull} aria-label="פתיחת ריטה במסך מלא" title="מסך מלא" className={iconBtn}><Maximize2 className="h-3.5 w-3.5" /></button>
        </div>
        <p className="min-w-0 flex-1 text-center text-[11px] font-medium leading-tight text-foreground">{RITA_CHAT_GREETING}</p>
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          disabled={messages.length === 0 && !loading}
          aria-label={collapsed ? 'הרחבת צ׳אט' : 'צמצום צ׳אט'}
          title={collapsed ? 'הרחבה' : 'צמצום'}
          className={iconBtn}
        >
          {collapsed ? <ChevronsUpDown className="h-3.5 w-3.5" /> : <ChevronsDownUp className="h-3.5 w-3.5" />}
        </button>
      </div>
      {(messages.length > 0 || loading) && !collapsed && <div ref={listRef} className="max-h-40 space-y-2 overflow-y-auto px-1 pb-2 text-xs">
        <div className="is-assistant group flex w-full items-start gap-2">
          <RitaAvatar className="mt-0.5 h-7 w-7 shrink-0" />
          <p className="max-w-[78%] whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 text-xs text-foreground">{RITA_CHAT_GREETING}</p>
        </div>
        {messages.map((message, index) => {
          const mine = message.role === 'user';
          return <div key={index} className={cn('group flex w-full max-w-[92%] items-start gap-2', mine ? 'is-user mr-auto flex-row-reverse' : 'is-assistant ml-auto')}>
            {mine ? <RitaUserAvatar className="mt-0.5 h-7 w-7 shrink-0 border border-border" /> : <RitaAvatar className="mt-0.5 h-7 w-7 shrink-0" />}
            <p className={cn('whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-xs', mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}>{message.content}</p>
          </div>;
        })}
        {loading && <div className="flex items-center gap-2"><RitaAvatar className="h-7 w-7" /><p className="animate-pulse text-muted-foreground">ריטה חושבת…</p></div>}
      </div>}
      <form className="flex items-end gap-1.5 rounded-lg border border-border bg-background px-1.5 py-1" onSubmit={(event) => { event.preventDefault(); send(); }}>
        <button type="button" onClick={openFull} aria-label="פתיחת ריטה במסך מלא" title="מסך מלא" className="mb-0.5 shrink-0 rounded-full"><RitaAvatar className="h-7 w-7 ring-0" /></button>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onInput={(event) => resizeRitaTextarea(event.currentTarget)}
          onKeyDown={handleKeyDown}
          onFocus={(event) => { const textarea = event.currentTarget; window.setTimeout(() => textarea.scrollIntoView({ block: 'nearest' }), 300); }}
          placeholder={placeholder}
          aria-label="הודעה לריטה"
          rows={1}
          className="!min-h-8 max-h-32 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-1 text-[16px] text-foreground outline-none placeholder:text-[16px] placeholder:text-muted-foreground [field-sizing:fixed]"
        />
        <Button type="submit" size="icon" disabled={!text.trim() || loading || !ready} className="mb-0.5 h-7 w-7 shrink-0 rounded-full" aria-label="שליחה"><ArrowUp className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
