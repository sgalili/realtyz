import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from '@/lib/router-compat';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Loader2, Send, UserRound, Hand } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RitaAvatar } from '@/components/RitaAvatar';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Session = { id: string; user_id: string | null; visitor_token_hash?: string | null; mode: 'ai' | 'human'; last_message: string | null; last_role: string | null; last_message_at: string };
type Profile = { id: string; full_name: string | null; avatar_url: string | null };
type Msg = { id: string; role: 'user' | 'assistant' | 'admin'; content: string; created_at: string };

type Card = Session & { sessionIds: string[] };

/** Turns markdown links and bare URLs/paths into active links; site paths stay same-origin. */
function Linkified({ text }: { text: string }) {
  const out: ReactNode[] = []; const re = /\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s)]+)/g; let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const raw = m[2] ?? m[3] ?? ''; const ext = /^https?:\/\//.test(raw); const href = ext ? raw : `/${raw.replace(/^\/+/, '')}`;
    if (ext || /^\/[\w\-/?=&.#%]*$/.test(href)) out.push(<a key={m.index} href={href} target="_blank" rel="noopener noreferrer" className="break-all font-semibold underline underline-offset-2">{m[1] ?? raw}</a>);
    else out.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

const when = (iso: string) => new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function useSessions() {
  return useQuery({
    queryKey: ['rita-live-sessions'],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('rita_live_sessions').select('id,user_id,visitor_token_hash,mode,last_message,last_role,last_message_at').order('last_message_at', { ascending: false }).limit(200);
      if (error) throw error;
      const sessions = (data ?? []) as Session[];
      const ids = [...new Set(sessions.map(s => s.user_id).filter(Boolean))] as string[];
      const { data: profiles } = ids.length ? await supabase.from('profiles').select('id,full_name,avatar_url').in('id', ids) : { data: [] };
      // One card per person: signed-in users by account, anonymous visitors by their browser token.
      const groups = new Map<string, Session[]>();
      for (const s of sessions) { const k = s.user_id ? `u:${s.user_id}` : s.visitor_token_hash ? `v:${s.visitor_token_hash}` : `s:${s.id}`; groups.set(k, [...(groups.get(k) ?? []), s]); }
      return { sessions: [...groups.values()].map(g => ({ ...g[0]!, sessionIds: g.map(x => x.id) })), profiles: new Map(((profiles ?? []) as Profile[]).map(p => [p.id, p])) };
    },
  });
}

function Identity({ profile, guest, size = 'h-11 w-11' }: { profile?: Profile; guest: boolean; size?: string }) {
  if (!guest && profile?.avatar_url) return <img src={profile.avatar_url} alt="" className={cn(size, 'shrink-0 rounded-full object-cover')} />;
  return <span className={cn(size, 'flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground')}><UserRound className="h-5 w-5" /></span>;
}

function Transcript({ session, profile, onClose }: { session: Card; profile?: Profile; onClose: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const guest = !session.user_id;
  const name = guest ? 'מבקר אנונימי' : profile?.full_name?.trim() || 'משתמש רשום';
  const msgs = useQuery({
    queryKey: ['rita-live-messages', session.id, session.sessionIds.length],
    refetchInterval: 3000,
    queryFn: async () => {
      const { data, error } = await supabase.from('rita_live_messages').select('id,role,content,created_at').in('session_id', session.sessionIds).order('created_at').limit(1000);
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
  });
  const live = useQuery({ queryKey: ['rita-live-mode', session.id], refetchInterval: 3000, initialData: session.mode,
    queryFn: async () => ((await supabase.from('rita_live_sessions').select('mode').eq('id', session.id).single()).data?.mode ?? session.mode) as 'ai' | 'human' });
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs.data?.length]);
  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('rita-live', { body: { session_id: session.id, ...body } });
    if (error || data?.error) throw new Error('הפעולה נכשלה');
  };
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['rita-live-messages', session.id] }); void qc.invalidateQueries({ queryKey: ['rita-live-mode', session.id] }); void qc.invalidateQueries({ queryKey: ['rita-live-sessions'] }); };
  const reply = useMutation({ mutationFn: () => call({ action: 'admin_reply', content: text.trim() }), onSuccess: () => { setText(''); refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const mode = useMutation({ mutationFn: (m: 'ai' | 'human') => call({ action: 'set_mode', mode: m }), onSuccess: (_, m) => { toast.success(m === 'human' ? 'השתלטת על השיחה. ריטה לא תענה עד שתחזיר לה.' : 'השיחה הוחזרה לריטה'); refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const human = live.data === 'human';
  return <Dialog open onOpenChange={o => !o && onClose()}>
    <DialogContent dir="rtl" className="flex h-[88dvh] max-w-2xl flex-col gap-3">
      <DialogHeader className="text-right">
        <DialogTitle className="flex items-center gap-3"><Identity profile={profile} guest={guest} />{name}</DialogTitle>
        <DialogDescription className={human ? undefined : 'sr-only'}>{human ? 'אתה עונה ידנית · ריטה מושהית' : 'שיחה עם ריטה'}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-lg bg-muted/40 p-3">
        {msgs.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (msgs.data ?? []).map(m => {
          const mine = m.role === 'user';
          return <div key={m.id} className={cn('flex items-start gap-2', mine ? 'flex-row' : 'flex-row-reverse')}>
            {mine ? <Identity profile={profile} guest={guest} size="h-7 w-7" /> : m.role === 'assistant' ? <RitaAvatar className="h-7 w-7 shrink-0" /> : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Hand className="h-4 w-4" /></span>}
            <div className={cn('min-w-0 max-w-[80%] whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-lg px-3 py-2 text-base', mine ? 'bg-background border border-border' : m.role === 'admin' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border')}>
              <Linkified text={m.content} /><div className="mt-1 text-xs opacity-70">{m.role === 'admin' ? 'מענה ידני · ' : ''}{when(m.created_at)}</div>
            </div>
          </div>;
        })}
        <div ref={endRef} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {human
          ? <Button variant="outline" disabled={mode.isPending} onClick={() => mode.mutate('ai')}><Bot className="h-4 w-4" />החזרה לריטה</Button>
          : <Button variant="outline" disabled={mode.isPending} onClick={() => mode.mutate('human')}><Hand className="h-4 w-4" />השתלטות על השיחה</Button>}
      </div>
      {human && <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); if (text.trim()) reply.mutate(); }}>
        <Textarea aria-label="מענה ידני למשתמש" rows={2} className="min-h-12 text-base" value={text} onChange={e => setText(e.target.value)} placeholder="כתיבת מענה ידני (ישהה את ריטה)" />
        <Button type="submit" size="icon" className="h-12 w-12 shrink-0" aria-label="שליחת מענה" disabled={!text.trim() || reply.isPending}>{reply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
      </form>}
    </DialogContent>
  </Dialog>;
}

/** Super Admin view of every sidebar Rita chat, with live transcripts and manual takeover. */
export function RitaChatsManager() {
  const q = useSessions();
  const [params, setParams] = useSearchParams();
  const openId = params.get('session');
  const setOpen = (id: string | null) => { const next = new URLSearchParams(params); if (id) next.set('session', id); else next.delete('session'); setParams(next, { replace: true }); };
  const sessions = q.data?.sessions ?? [];
  const open = sessions.find(s => s.id === openId || s.sessionIds.includes(openId ?? ''));
  return <section dir="rtl" className="min-w-0 max-w-full space-y-4 overflow-x-hidden py-5 text-right">
    {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : q.isError ? <p role="alert" className="text-destructive">קריאת השיחות נכשלה</p> : sessions.length === 0 ? <p className="text-muted-foreground">עדיין לא התקיימו שיחות עם ריטה.</p> :
      <ul className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">{sessions.map(s => {
        const profile = s.user_id ? q.data!.profiles.get(s.user_id) : undefined;
        const guest = !s.user_id;
        return <li key={s.id} className="min-w-0"><button type="button" onClick={() => setOpen(s.id)} className="flex w-full min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-xl border border-border/70 p-3 text-right transition-colors hover:bg-muted/50">
          <Identity profile={profile} guest={guest} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2"><span className="truncate text-base font-bold">{guest ? 'מבקר אנונימי' : profile?.full_name?.trim() || 'משתמש רשום'}</span><span className="shrink-0 text-xs text-muted-foreground">{when(s.last_message_at)}</span></div>
            <p className="line-clamp-2 break-words [overflow-wrap:anywhere] text-sm text-muted-foreground">{s.last_role === 'assistant' ? 'ריטה: ' : s.last_role === 'admin' ? 'אתה: ' : ''}{s.last_message}</p>
          </div>
          {guest && <Badge variant="secondary" className="shrink-0">אורח</Badge>}
          {s.sessionIds.length > 1 && <Badge variant="outline" className="shrink-0">{s.sessionIds.length}</Badge>}
          {s.mode === 'human' && <Badge className="shrink-0">ידני</Badge>}
        </button></li>;
      })}</ul>}
    {open && <Transcript key={open.id} session={open} profile={open.user_id ? q.data!.profiles.get(open.user_id) : undefined} onClose={() => setOpen(null)} />}
  </section>;
}
