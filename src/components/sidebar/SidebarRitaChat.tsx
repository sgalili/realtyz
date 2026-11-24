import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowUp, Maximize2, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { RitaAvatar } from '@/components/RitaAvatar';
import { RitaUserAvatar } from '@/components/rita/RitaUserAvatar';
import { useRitaWorkspaceIdentity } from '@/hooks/useRitaWorkspaceIdentity';
import { cn } from '@/lib/utils';
import { ritaChatKeyAction } from '@/lib/ritaChatKeys';
import { RITA_CHAT_GREETING, resizeRitaTextarea } from '@/lib/ritaChatPresentation';

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
  const [chatHeight, setChatHeight] = useState<number | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
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
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages, loading, chatHeight]);
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

  const openFull = () => window.dispatchEvent(new CustomEvent('open-ai-drawer', { detail: { expanded: true } }));
  const clearChat = () => {
    setMessages([]);
    setChatHeight(null);
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

  const availableHeight = (conversation: HTMLDivElement, handle: HTMLElement) => {
    const currentHeight = conversation.getBoundingClientRect().height;
    const sidebarTop = handle.closest('[data-sidebar="sidebar"]')?.getBoundingClientRect().top ?? 0;
    return currentHeight + Math.max(0, conversation.getBoundingClientRect().top - sidebarTop - 24);
  };
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const conversation = conversationRef.current;
    if (!conversation) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = conversation.getBoundingClientRect().height;
    const maxHeight = availableHeight(conversation, event.currentTarget);
    const move = (pointer: PointerEvent) => setChatHeight(Math.round(Math.min(maxHeight, Math.max(0, startHeight + startY - pointer.clientY))));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    const conversation = conversationRef.current;
    if (!conversation) return;
    event.preventDefault();
    const currentHeight = conversation.getBoundingClientRect().height;
    const maxHeight = availableHeight(conversation, event.currentTarget);
    const delta = event.key === 'ArrowUp' ? 40 : -40;
    setChatHeight(Math.round(Math.min(maxHeight, Math.max(0, currentHeight + delta))));
  };

  const actionButton = 'pointer-events-auto h-8 w-8 rounded-none bg-transparent p-0 text-muted-foreground hover:bg-transparent hover:text-foreground';

  return (
    <div dir="rtl" className="relative px-2 pb-2 pt-3" style={{ paddingBottom: 8 + (inputFocused ? keyboardInset : 0) }}>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="גרירה להגדלת שיחת ריטה"
        tabIndex={0}
        className="absolute inset-x-0 -top-2 z-10 flex h-4 cursor-row-resize touch-none items-center justify-center"
        onPointerDown={startDrag}
        onKeyDown={resizeWithKeyboard}
      >
        <span className="h-1 w-10 rounded-full bg-border" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 -top-4 z-20 flex h-8 items-center justify-start">
        <Button variant="ghost" size="icon" className={actionButton} aria-label="הגדלת שיחה עם ריטה" title="מסך מלא" onClick={openFull}>
          <Maximize2 className="h-4 w-4" />
        </Button>
        {messages.length > 0 && <div className="absolute left-0 top-0">
          <Button
            variant="ghost"
            size="icon"
            aria-label="איפוס צ׳אט"
            title="איפוס צ׳אט"
            className={actionButton}
            onClick={() => { if (window.confirm('למחוק את כל השיחה עם ריטה? ההיסטוריה תימחק לצמיתות.')) clearChat(); }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>}
      </div>

      <div ref={conversationRef} data-testid="rita-mini-conversation" className="flex min-h-0 flex-col overflow-hidden" style={chatHeight == null ? undefined : { height: chatHeight }}>
        <div ref={listRef} className={cn('space-y-2 overflow-y-auto px-1 pb-2 text-xs', chatHeight == null ? 'max-h-40' : 'min-h-0 flex-1')}>
          <div className="is-assistant group flex w-full items-start gap-2">
            <RitaAvatar className="mt-0.5 h-7 w-7 shrink-0" />
            <p className="max-w-[78%] whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 text-xs text-foreground">{firstName ? `היי ${firstName}, מה עושים היום?` : RITA_CHAT_GREETING}</p>
          </div>
          {messages.map((message, index) => {
            const mine = message.role === 'user';
            return <div key={index} className={cn('group flex w-full max-w-[92%] items-start gap-2', mine ? 'is-user mr-auto flex-row-reverse' : 'is-assistant ml-auto')}>
              {mine ? <RitaUserAvatar className="mt-0.5 h-7 w-7 shrink-0 border border-border" /> : <RitaAvatar className="mt-0.5 h-7 w-7 shrink-0" />}
              <p className={cn('whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-xs', mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}>{message.content}</p>
            </div>;
          })}
          {loading && <div className="flex items-center gap-2"><RitaAvatar className="h-7 w-7" /><p className="animate-pulse text-muted-foreground">ריטה חושבת…</p></div>}
        </div>
      </div>
      <form className="mt-2 flex items-end gap-1.5 rounded-lg border border-border bg-background px-1.5 py-1" onSubmit={(event) => { event.preventDefault(); send(); }}>
        <button type="button" onClick={openFull} aria-label="פתיחת ריטה במסך מלא" title="מסך מלא" className="mb-0.5 shrink-0 rounded-full"><RitaUserAvatar className="h-7 w-7" /></button>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onInput={(event) => resizeRitaTextarea(event.currentTarget)}
          onKeyDown={handleKeyDown}
          onBlur={() => setInputFocused(false)}
          onFocus={(event) => { setInputFocused(true); const textarea = event.currentTarget; window.setTimeout(() => textarea.scrollIntoView({ block: 'nearest' }), 300); }}
          aria-label="הודעה לריטה"
          rows={1}
          className="!min-h-10 max-h-32 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-2 text-xs text-foreground outline-hidden [field-sizing:fixed]"
        />
        <Button type="submit" size="icon" disabled={!text.trim() || loading || !ready} className="mb-0.5 h-7 w-7 shrink-0 rounded-full" aria-label="שליחה"><ArrowUp className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
