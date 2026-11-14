import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { ArrowUp, Maximize2, Trash2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RitaAvatar } from '@/components/RitaAvatar';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from '@/components/ai-elements/prompt-input';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const KEY = 'toraff-visitor-rita-history';
function readHistory(): UIMessage[] {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(data) ? data.filter(m => typeof m.id === 'string' && ['user', 'assistant'].includes(m.role) && Array.isArray(m.parts)).slice(-24) : [];
  } catch { return []; }
}

export function VisitorRitaChat({ onSignup }: { onSignup: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const transport = useMemo(() => new DefaultChatTransport({
    api: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/visitor-rita`,
    headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    prepareSendMessagesRequest: ({ messages }) => ({ body: { messages: messages.slice(-24).map(m => ({ id: m.id, role: m.role, parts: m.parts.filter(p => p.type === 'text').map(p => ({ type: 'text', text: p.text })) })) } }),
  }), []);
  const [initial] = useState(readHistory);
  const { messages, sendMessage, status, error, stop, setMessages } = useChat({ id: 'toraff-visitor', messages: initial, transport });
  const busy = status === 'submitted' || status === 'streaming';
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(messages.slice(-24))); } catch { /* unavailable storage does not block chat */ }
    if (!busy) inputRef.current?.focus();
  }, [messages, busy]);
  const content = <div className="flex min-h-0 flex-1 flex-col gap-2" dir="rtl">
    <Conversation className={expanded ? 'min-h-0 flex-1' : 'max-h-48 min-h-0'}>
      <ConversationContent className="gap-3 px-2 py-2">
        {messages.length === 0 && <p className="text-base text-muted-foreground">היי, אני ריטה. מה מביא אותך ל־TORAFF?</p>}
        {messages.map(message => <Message key={message.id} from={message.role}><MessageContent className="text-base group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground">{message.parts.map((part, i) => part.type === 'text' ? <MessageResponse key={i}>{part.text}</MessageResponse> : null)}</MessageContent></Message>)}
        {status === 'submitted' && <Shimmer>ריטה חושבת…</Shimmer>}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
    {error && <p role="alert" className="px-2 text-sm text-destructive">{error.message || 'ריטה אינה זמינה כרגע. נסו שוב מאוחר יותר.'}</p>}
    <PromptInput onSubmit={({ text }) => { if (!text.trim() || busy) return; void sendMessage({ text: text.trim().slice(0, 3000) }); }} className="rounded-lg">
      <PromptInputTextarea ref={inputRef} autoFocus placeholder="איך אוכל לעזור?" aria-label="הודעה לריטה" className="min-h-12 text-base" />
      <PromptInputFooter className="justify-between">
        <Button type="button" variant="ghost" size="icon" aria-label="פתיחת ריטה במסך מלא" onClick={() => setExpanded(true)}><RitaAvatar className="h-8 w-8" /></Button>
        <PromptInputSubmit status={status} onStop={stop} aria-label={busy ? 'עצירת תשובה' : 'שליחה לריטה'}>{busy ? <Square className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}</PromptInputSubmit>
      </PromptInputFooter>
    </PromptInput>
    <Button variant="link" onClick={onSignup} className="h-9 text-base">הרשמה חינם או כניסה</Button>
  </div>;
  return <>
    <div className="border-t border-border px-3 pb-2 pt-3">
      <div className="mb-1 flex items-center justify-between"><span className="font-bold">ריטה</span><div className="flex gap-1"><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="הגדלת שיחה עם ריטה" onClick={() => setExpanded(true)}><Maximize2 className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="איפוס שיחת ריטה" disabled={busy || messages.length === 0} onClick={() => { if (window.confirm('למחוק את שיחת ריטה שנשמרה בדפדפן?')) setMessages([]); }}><Trash2 className="h-4 w-4" /></Button></div></div>
      {!expanded && content}
    </div>
    <Dialog open={expanded} onOpenChange={setExpanded}><DialogContent className="flex h-[85dvh] max-w-2xl flex-col" dir="rtl"><DialogHeader><DialogTitle className="flex items-center gap-3"><RitaAvatar className="h-10 w-10" />ריטה</DialogTitle><DialogDescription>נעים להכיר</DialogDescription></DialogHeader>{expanded && content}</DialogContent></Dialog>
  </>;
}