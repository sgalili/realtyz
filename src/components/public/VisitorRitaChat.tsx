import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useQuery } from '@tanstack/react-query';
import { useStickToBottomContext } from 'use-stick-to-bottom';
import { ArrowUp, Maximize2, Trash2, Square, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { InputGroupAddon } from '@/components/ui/input-group';
import { RitaAvatar } from '@/components/RitaAvatar';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { PromptInput, PromptInputTextarea, PromptInputSubmit } from '@/components/ai-elements/prompt-input';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { ritaChatKeyAction } from '@/lib/ritaChatKeys';

const KEY = 'toraff-visitor-rita-history';
const GREETING = 'היי, אני ריטה. מה מביא אותך ל־TORAFF?';
// Keeps the newest bubble visible: scrolls the transcript to its bottom whenever a message is added or grows.
function AutoStickBottom({ trigger }: { trigger: unknown }) {
  const { scrollToBottom } = useStickToBottomContext();
  useEffect(() => { scrollToBottom(); }, [trigger, scrollToBottom]);
  return null;
}
function readHistory(): UIMessage[] {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(data) ? data.filter(m => typeof m.id === 'string' && ['user', 'assistant'].includes(m.role) && Array.isArray(m.parts)).slice(-24) : [];
  } catch { return []; }
}

export function VisitorRitaChat() {
  const [expanded, setExpanded] = useState(false);
  // PromptInputTextarea does not forward refs, so reach the textarea through the wrapper instead.
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const getTextarea = () => inputWrapRef.current?.querySelector('textarea') ?? null;
  const transport = useMemo(() => new DefaultChatTransport({
    api: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/visitor-rita`,
    headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    prepareSendMessagesRequest: ({ messages }) => ({ body: { messages: messages.slice(-24).map(m => ({ id: m.id, role: m.role, parts: m.parts.filter(p => p.type === 'text').map(p => ({ type: 'text', text: p.text })) })) } }),
  }), []);
  const [initial] = useState(readHistory);
  const { messages, sendMessage, status, error, stop, setMessages } = useChat({ id: 'toraff-visitor', messages: initial, transport });
  const busy = status === 'submitted' || status === 'streaming';
  const { user } = useAuth();
  const { data: myAvatar } = useQuery({
    queryKey: ['visitor-rita-avatar', user?.id ?? null],
    enabled: !!user?.id,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('avatar_url').eq('id', user?.id ?? '').maybeSingle();
      return (data as { avatar_url?: string | null } | null)?.avatar_url ?? null;
    },
  });
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(messages.slice(-24))); } catch { /* unavailable storage does not block chat */ }
    const el = getTextarea();
    if (el && !el.value) el.style.height = '';
    if (!busy) el?.focus();
  }, [messages, busy]);
  // Enter sends; Shift/Command/Ctrl + Enter adds a new line.
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const action = ritaChatKeyAction({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing });
    if (action === 'ignore') return;
    e.preventDefault();
    const el = e.currentTarget;
    if (action === 'send') {
      const form = el.form;
      const submit = form?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      if (submit?.disabled) return;
      form?.requestSubmit();
      return;
    }
    el.setRangeText('\n', el.selectionStart, el.selectionEnd, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  // Dragging the top divider grows the transcript upward until just below the sign-up/sign-in buttons.
  const convRef = useRef<HTMLDivElement>(null);
  const [chatHeight, setChatHeight] = useState<number | null>(null);
  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const conv = convRef.current;
    if (!conv) return;
    e.preventDefault();
    const startY = e.clientY;
    const startH = conv.getBoundingClientRect().height;
    const authBottom = document.querySelector('[data-visitor-auth-actions]')?.getBoundingClientRect().bottom ?? 0;
    const maxH = startH + Math.max(0, conv.getBoundingClientRect().top - authBottom - 24);
    const move = (ev: PointerEvent) => setChatHeight(Math.round(Math.min(maxH, Math.max(120, startH + startY - ev.clientY))));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const sized = !expanded && chatHeight != null;
  const content = <div className="flex min-h-0 flex-1 flex-col gap-2" dir="rtl">
    <div ref={convRef} className={expanded ? 'flex min-h-0 flex-1 flex-col' : 'flex min-h-0 flex-col'} style={sized ? { height: chatHeight } : undefined}>
    <Conversation className={expanded || sized ? 'min-h-0 flex-1' : 'max-h-48 min-h-0'}>
      <ConversationContent className="gap-3 px-2 py-2" scrollClassName={expanded || sized ? undefined : 'max-h-48'}>
        <div className="is-assistant group flex w-full items-start gap-2"><RitaAvatar className="mt-0.5 h-7 w-7 shrink-0" /><MessageContent className="max-w-[78%] rounded-lg bg-muted px-3 py-2 text-sm font-normal">{GREETING}</MessageContent><div className="ms-auto flex shrink-0 items-center gap-1 self-center">{!expanded && <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="הגדלת שיחה עם ריטה" onClick={() => setExpanded(true)}><Maximize2 className="h-4 w-4" /></Button>}{messages.length > 0 && <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="איפוס שיחת ריטה" disabled={busy} onClick={() => { if (window.confirm('למחוק את שיחת ריטה שנשמרה בדפדפן?')) setMessages([]); }}><Trash2 className="h-4 w-4" /></Button>}</div></div>
        {messages.map(message => {
          const mine = message.role === 'user';
          return <div key={message.id} className={cn('group flex w-full max-w-[92%] items-start gap-2', mine ? 'is-user mr-auto flex-row-reverse' : 'is-assistant ml-auto')}>
            {mine
              ? <Avatar className="mt-0.5 h-7 w-7 shrink-0 border border-border bg-muted"><AvatarImage src={myAvatar ?? undefined} alt="המשתמש" /><AvatarFallback className="text-muted-foreground"><UserRound className="h-4 w-4" /></AvatarFallback></Avatar>
              : <RitaAvatar className="mt-0.5 h-7 w-7 shrink-0" />}
            <MessageContent className="rounded-lg bg-muted px-3 py-2 text-sm group-[.is-user]:ml-0 group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground">{message.parts.map((part, i) => part.type === 'text' ? <MessageResponse key={i}>{part.text}</MessageResponse> : null)}</MessageContent>
          </div>;
        })}
        {status === 'submitted' && <Shimmer>ריטה חושבת…</Shimmer>}
      </ConversationContent>
      <ConversationScrollButton />
      <AutoStickBottom trigger={messages} />
    </Conversation>
    </div>
    {error && <p role="alert" className="px-2 text-sm text-destructive">{error.message || 'ריטה אינה זמינה כרגע. נסו שוב מאוחר יותר.'}</p>}
    <div ref={inputWrapRef}><PromptInput onSubmit={({ text }) => { if (!text.trim() || busy) return; void sendMessage({ text: text.trim().slice(0, 3000) }); const el = getTextarea(); if (el) el.style.height = ''; }} className="rounded-lg">
      <PromptInputTextarea autoFocus placeholder="איך אוכל לעזור?" aria-label="הודעה לריטה" rows={1} className="!min-h-10 max-h-32 resize-none overflow-y-auto py-2 text-sm [field-sizing:fixed]" onKeyDown={handleKeyDown} onInput={e => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight, 128)}px`; }} onFocus={e => { const t = e.currentTarget; window.setTimeout(() => t.scrollIntoView({ block: 'nearest' }), 300); }} />
      <InputGroupAddon align="inline-end" className="self-end px-2 pb-1.5">
        <PromptInputSubmit status={status} onStop={stop} aria-label={busy ? 'עצירת תשובה' : 'שליחה לריטה'}>{busy ? <Square className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}</PromptInputSubmit>
      </InputGroupAddon>
    </PromptInput></div>
  </div>;
  return <>
    <div className="relative border-t border-border px-3 pb-2 pt-3">
      {!expanded && <div role="separator" aria-orientation="horizontal" aria-label="גרירה להגדלת שיחת ריטה" className="absolute inset-x-0 -top-2 z-10 flex h-4 cursor-row-resize touch-none items-center justify-center" onPointerDown={startDrag}><span className="h-1 w-10 rounded-full bg-border" /></div>}
      {!expanded && content}
    </div>
    <Dialog open={expanded} onOpenChange={setExpanded}><DialogContent className="flex h-[85dvh] max-w-2xl flex-col" dir="rtl"><DialogHeader><DialogTitle className="flex items-center gap-3"><RitaAvatar className="h-10 w-10" />ריטה</DialogTitle><DialogDescription>נעים להכיר</DialogDescription></DialogHeader>{expanded && content}</DialogContent></Dialog>
  </>;
}
