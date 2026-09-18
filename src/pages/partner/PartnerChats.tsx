// Partner-only "צ'אטים" screen: live monitoring of every conversation the
// partner is involved in, whether Rita answered automatically or the partner
// replied manually. Reads are scoped to the signed-in partner only.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ArrowRight, Bot, MessageCircle, Search, Send, User } from 'lucide-react';
import { toast } from 'sonner';
import ContactAvatar from '@/components/contacts/ContactAvatar';
import {
  PARTNER_CHANNEL_LABELS,
  usePartnerChatMessages,
  usePartnerChats,
  usePartnerSendMessage,
  type PartnerChat,
} from '@/hooks/usePartnerSurfaces';

function fmtTime(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function ChatThread({ chat, onBack }: { chat: PartnerChat; onBack: () => void }) {
  const { data: messages = [], isLoading } = usePartnerChatMessages(chat.lead_id);
  const send = usePartnerSendMessage();
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, chat.lead_id]);

  const submit = () => {
    const content = draft.trim();
    if (!content) return;
    send.mutate(
      { leadId: chat.lead_id, content, channel: chat.last_channel },
      {
        onSuccess: () => { setDraft(''); toast.success('ההודעה נשלחה'); },
        onError: () => toast.error('שליחת ההודעה נכשלה'),
      },
    );
  };

  return (
    <div className="flex h-[calc(100dvh-220px)] min-h-[360px] flex-col" dir="rtl">
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="חזרה">
          <ArrowRight className="h-4 w-4" />
        </Button>
        <ContactAvatar name={chat.full_name ?? undefined} imageUrl={chat.profile_picture_url ?? undefined} className="h-8 w-8" />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-slate-800">{chat.full_name || chat.phone_number || 'איש קשר'}</p>
          <p className="text-[12px] text-slate-500">
            {PARTNER_CHANNEL_LABELS[(chat.last_channel || '').toLowerCase()] || chat.last_channel || ''}
          </p>
        </div>
        {chat.ai_autopilot && (
          <Badge className="ms-auto bg-sky-50 text-sky-700 ring-1 ring-sky-200">
            <Bot className="me-1 h-3.5 w-3.5" /> ריטה פעילה
          </Badge>
        )}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto py-3">
        {isLoading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-2/3" />)
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-[14px] text-slate-500">אין הודעות בשיחה זו.</p>
        ) : (
          messages.map((m) => {
            const outbound = m.direction === 'outbound';
            return (
              <div key={m.id} className={`flex ${outbound ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={`min-w-0 max-w-[80%] rounded-2xl px-3 py-2 text-[14px] leading-relaxed ${
                    outbound ? 'bg-primary text-primary-foreground' : 'bg-slate-100 text-slate-800'
                  }`}
                  style={{ overflowWrap: 'anywhere' }}
                >
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  <p className={`mt-1 text-[11px] ${outbound ? 'opacity-80' : 'text-slate-500'}`}>
                    {m.ai_assisted ? 'ריטה • ' : ''}{fmtTime(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-slate-200 pt-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="כתוב הודעה"
          rows={2}
          className="min-h-[44px] flex-1 text-[14px]"
        />
        <Button size="icon" onClick={submit} disabled={send.isPending || !draft.trim()} aria-label="שליחה">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function PartnerChats() {
  const { data: chats = [], isLoading } = usePartnerChats();
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) =>
      `${c.full_name ?? ''} ${c.phone_number ?? ''} ${c.last_message ?? ''}`.toLowerCase().includes(q));
  }, [chats, search]);

  const active = chats.find((c) => c.lead_id === activeId) || null;
  if (active) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <ChatThread chat={active} onBack={() => setActiveId(null)} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3" dir="rtl">
      <div className="relative">
        <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש שיחה"
          className="pe-9 text-[14px]"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <MessageCircle className="h-6 w-6 text-slate-400" />
            <p className="text-[14px] text-slate-600">אין שיחות להצגה כרגע.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <Card
              key={c.lead_id}
              role="button"
              tabIndex={0}
              onClick={() => setActiveId(c.lead_id)}
              onKeyDown={(e) => { if (e.key === 'Enter') setActiveId(c.lead_id); }}
              className="cursor-pointer border-slate-200 transition hover:bg-slate-50"
            >
              <CardContent className="flex items-start gap-3 p-3">
                <ContactAvatar name={c.full_name ?? undefined} imageUrl={c.profile_picture_url ?? undefined} className="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[14px] font-medium text-slate-800">
                      {c.full_name || c.phone_number || 'איש קשר'}
                    </p>
                    <span className="shrink-0 text-[12px] text-slate-500">{fmtTime(c.last_message_at)}</span>
                  </div>
                  <p className="line-clamp-2 break-words text-[13px] text-slate-600">{c.last_message || 'אין הודעות'}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[12px] font-normal">
                      {PARTNER_CHANNEL_LABELS[(c.last_channel || '').toLowerCase()] || c.last_channel || 'הודעה'}
                    </Badge>
                    <span className="inline-flex items-center gap-1 text-[12px] text-slate-500">
                      {c.ai_autopilot ? <Bot className="h-3.5 w-3.5 text-sky-600" /> : <User className="h-3.5 w-3.5 text-slate-500" />}
                      {c.ai_autopilot ? 'מנוהל על ידי ריטה' : 'מנוהל ידנית'}
                    </span>
                    <span className="text-[12px] text-slate-500">{c.message_count} הודעות</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
