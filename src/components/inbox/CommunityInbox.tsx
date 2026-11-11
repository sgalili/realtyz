import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Loader2, MessageCircle, Search, Send, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChatMessageText } from './ChatMessageText';
import { communityMessageContent } from '@/lib/communityChat';
import { toast } from 'sonner';
import { CommunityGroups } from './CommunityGroups';
import { RitaChatButton } from './RitaChatButton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

type Peer = { id: string; full_name: string | null; avatar_url: string | null };

export function CommunityInbox() {
  const { user } = useAuth();
  const workspace = useActiveWorkspaceOwnerId();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [view, setView] = useState('private');
  const [peer, setPeer] = useState<Peer | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const contacts = useQuery({
    queryKey: ['community-contacts', user?.id, search], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_chat_contacts', { _search: search });
      if (error) throw error;
      return data;
    },
  });
  const eligibility = useQuery({
    queryKey: ['community-eligible', user?.id], enabled: !!user,
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase.rpc('is_community_chat_member', { _user: user.id });
      if (error) throw error;
      return data;
    },
  });
  const threads = useQuery({
    queryKey: ['community-threads', user?.id], enabled: !!user, refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_chat_threads');
      if (error) throw error;
      return data.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    },
  });
  const messages = useQuery({
    queryKey: ['community-messages', user?.id, peer?.id], enabled: !!user && !!peer, refetchInterval: 15000,
    queryFn: async () => {
      if (!user || !peer) return [];
      const { data, error } = await supabase.from('community_chat_messages').select('*')
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${peer.id}),and(sender_id.eq.${peer.id},recipient_id.eq.${user.id})`)
        .order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data.reverse();
    },
  });
  const send = useMutation({
    mutationFn: async ({ target, text }: { target: string; text: string }) => {
      if (!user || !workspace) throw new Error('לא ניתן לשלוח כרגע');
      const { error } = await supabase.from('community_chat_messages').insert({ sender_id: user.id, recipient_id: target, workspace_owner_id: workspace, content: text });
      if (error) throw error;
      return { target, text };
    },
    onSuccess: ({ target, text }) => {
      setDrafts(previous => previous[target] === text ? { ...previous, [target]: '' } : previous);
      void queryClient.invalidateQueries({ queryKey: ['community-messages', user?.id, target] });
      void queryClient.invalidateQueries({ queryKey: ['community-threads', user?.id] });
    },
    onError: () => toast.error('שליחת ההודעה נכשלה. ניתן לנסות שוב.'),
  });
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages.data?.length, peer?.id]);
  const draft = peer ? drafts[peer.id] ?? '' : '';
  const submit = () => {
    const text = communityMessageContent(draft);
    if (peer && text && !send.isPending) send.mutate({ target: peer.id, text });
  };
  const peers: Peer[] = search ? contacts.data ?? [] : [
    ...(threads.data ?? []).map(thread => ({ id: thread.peer_id, full_name: thread.full_name, avatar_url: thread.avatar_url })),
    ...(contacts.data ?? []).filter(contact => !threads.data?.some(thread => thread.peer_id === contact.id)),
  ];
  return <Tabs dir="rtl" value={view} onValueChange={setView} className="flex h-full min-h-0 flex-col gap-2">
    <TabsList className="grid w-full shrink-0 grid-cols-2"><TabsTrigger value="private">שיחות פרטיות</TabsTrigger><TabsTrigger value="groups">קבוצות</TabsTrigger></TabsList>
    <TabsContent value="groups" forceMount className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden"><CommunityGroups eligible={eligibility.data === true} /></TabsContent>
    <TabsContent value="private" forceMount className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden">
    <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-[20rem_minmax(0,1fr)]">
    <aside className={`${peer ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col border-e border-border`}>
      <div className="relative m-3 shrink-0">
        <Search className="absolute end-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input aria-label="חיפוש בקהילה" placeholder="חיפוש בקהילה..." className="pe-9" value={search} onChange={event => setSearch(event.target.value)} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {(contacts.isLoading || threads.isLoading) && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />}
        {(contacts.isError || threads.isError || eligibility.isError) && <div role="alert" className="p-4 text-destructive">טעינת השיחות נכשלה<Button variant="ghost" onClick={() => { void contacts.refetch(); void threads.refetch(); void eligibility.refetch(); }}>נסה שוב</Button></div>}
        {eligibility.data === false && <p className="p-4 text-sm text-muted-foreground">מועדון הקהילה פתוח לסוכנים, למתווכים וליזמים.</p>}
        {eligibility.data && !contacts.isLoading && !threads.isLoading && !peers.length && <p className="p-4 text-sm text-muted-foreground">לא נמצאו חברי קהילה</p>}
        {peers.map(contact => {
          const last = threads.data?.find(thread => thread.peer_id === contact.id);
          return <Button key={contact.id} variant="ghost" className={`h-auto min-h-16 w-full justify-start gap-3 rounded-none border-b border-border px-3 py-3 text-start ${peer?.id === contact.id ? 'bg-muted' : ''}`} onClick={() => setPeer(contact)}>
            <Avatar className="h-10 w-10 shrink-0"><AvatarImage src={contact.avatar_url ?? undefined} /><AvatarFallback><Users className="h-4 w-4" /></AvatarFallback></Avatar>
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{contact.full_name}</span><span className="block truncate text-xs text-muted-foreground">{last?.content ?? 'שיחה חדשה'}</span></span>
          </Button>;
        })}
      </div>
    </aside>
    <section className={`${peer ? 'flex' : 'hidden lg:flex'} min-h-0 min-w-0 flex-col`}>
      {!peer ? <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground"><MessageCircle className="h-10 w-10" /><span>מועדון הקהילה</span></div> : <>
        <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-border px-3">
          <Button size="icon" variant="ghost" aria-label="חזרה לשיחות הקהילה" className="lg:hidden" onClick={() => setPeer(null)}><ArrowRight className="h-5 w-5" /></Button>
          <span className="min-w-0 flex-1 truncate font-semibold">{peer.full_name}</span>
          <RitaChatButton kind="peer" target={peer.id} />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4" role="log" aria-label="הודעות הקהילה">
          {messages.isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin" />}
          {messages.isError && <div role="alert" className="text-destructive">טעינת ההודעות נכשלה<Button variant="ghost" onClick={() => void messages.refetch()}>נסה שוב</Button></div>}
          {!messages.isLoading && !messages.isError && !messages.data?.length && <p className="text-center text-muted-foreground">אין הודעות בשיחה</p>}
          {messages.data?.map(message => <div key={message.id} className={`mb-3 flex ${message.sender_id === user?.id ? 'justify-start' : 'justify-end'}`}><div className={`max-w-[85%] break-words rounded-lg px-3 py-2 ${message.sender_id === user?.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}><ChatMessageText content={message.content} /><time className="mt-1 block text-end text-xs opacity-70">{new Date(message.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</time></div></div>)}
          <div ref={endRef} />
        </div>
        <form className="flex shrink-0 gap-2 border-t border-border p-3" onSubmit={event => { event.preventDefault(); submit(); }}>
          <Input aria-label="הודעה לקהילה" placeholder="הקלד הודעה..." maxLength={4000} value={draft} disabled={!eligibility.data} onChange={event => setDrafts(previous => ({ ...previous, [peer.id]: event.target.value }))} className="min-w-0 flex-1" />
          <Button type="submit" size="icon" aria-label="שלח הודעה לקהילה" disabled={!eligibility.data || !communityMessageContent(draft) || send.isPending} className="h-11 w-11 shrink-0">{send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
        </form>
      </>}
    </section>
  </div></TabsContent></Tabs>;
}