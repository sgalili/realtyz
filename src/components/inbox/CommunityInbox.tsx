import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

type Card = { id: string; full_name: string | null; category: string; office_name: string | null; license_number: string | null };
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Ban, UserPlus, Loader2, MessageCircle, Search, Send, Users } from 'lucide-react';
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
import { CommunityDirectory, ROLE_BADGE } from './CommunityDirectory';
import { Badge } from '@/components/ui/badge';
import { playSoftDing, showGroupedChatNotification } from '@/lib/communityNotify';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RitaChatButton } from './RitaChatButton';
import { CommunityProfileDialog } from './CommunityProfileDialog';
import { DealTermsDialog } from './DealTermsDialog';
import { DEAL_SAFETY_TIP } from '@/lib/communityChat';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

type Peer = { id: string; full_name: string | null; avatar_url: string | null };

export function CommunityInbox({ active }: { active: boolean }) {
  const { user } = useAuth();
  const workspace = useActiveWorkspaceOwnerId();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [view, setView] = useState('private');
  const [peer, setPeer] = useState<Peer | null>(null);
  const [directoryOpen, setDirectoryOpen] = useState(false);
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
  const blocks = useQuery({
    queryKey: ['community-blocks', user?.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('community_user_blocks').select('blocked_id');
      if (error) throw error;
      return new Set(data.map(row => row.blocked_id));
    },
  });
  const [blockOpen, setBlockOpen] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const deepPeer = searchParams.get('community');
  useEffect(() => { if (deepPeer) { setView('private'); setPeer({ id: deepPeer, full_name: null, avatar_url: null }); } }, [deepPeer]); // eslint-disable-line react-hooks/exhaustive-deps
  const blocked = !!peer && !!blocks.data?.has(peer.id);
  const toggleBlock = useMutation({
    mutationFn: async () => {
      if (!user || !peer) return;
      const { error } = blocked
        ? await supabase.from('community_user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', peer.id)
        : await supabase.from('community_user_blocks').insert({ blocker_id: user.id, blocked_id: peer.id });
      if (error) throw error;
    },
    onSuccess: () => { setBlockOpen(false); toast.success(blocked ? 'החסימה הוסרה' : 'המשתמש נחסם ולא יוכל לשלוח לך הודעות'); void queryClient.invalidateQueries({ queryKey: ['community-blocks', user?.id] }); },
    onError: () => toast.error('עדכון החסימה נכשל'),
  });
  // Grouped in-app notifications: one card per chat with the running count.
  const seen = useRef<Map<string, string> | null>(null);
  const pending = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!threads.data || !user) return;
    const first = seen.current === null;
    const next = new Map<string, string>();
    let ding = false;
    for (const thread of threads.data) {
      next.set(thread.peer_id, thread.created_at);
      if (first) continue;
      const before = seen.current!.get(thread.peer_id);
      if (before === thread.created_at || thread.last_sender_id === user.id || blocks.data?.has(thread.peer_id)) continue;
      const viewing = active && view === 'private' && peer?.id === thread.peer_id && document.visibilityState === 'visible';
      if (viewing) { delete pending.current[thread.peer_id]; continue; }
      pending.current[thread.peer_id] = (pending.current[thread.peer_id] ?? 0) + 1;
      ding = true;
      const target = { id: thread.peer_id, full_name: thread.full_name, avatar_url: thread.avatar_url };
      showGroupedChatNotification(thread.peer_id, thread.full_name ?? 'חבר קהילה', pending.current[thread.peer_id], thread.content, () => { setView('private'); setPeer(target); });
    }
    seen.current = next;
    if (ding) playSoftDing();
  }, [threads.data, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (peer) delete pending.current[peer.id]; }, [peer?.id]);
  const peers: Peer[] = search ? contacts.data ?? [] : [
    ...(threads.data ?? []).map(thread => ({ id: thread.peer_id, full_name: thread.full_name, avatar_url: thread.avatar_url })),
    ...(contacts.data ?? []).filter(contact => !threads.data?.some(thread => thread.peer_id === contact.id)),
  ].filter(p => !blocks.data?.has(p.id));
  const cardIds = [...new Set([...peers.map(p => p.id), ...(peer ? [peer.id] : [])])].slice(0, 200);
  const cards = useQuery({
    queryKey: ['community-cards', user?.id, cardIds.join(',')], enabled: !!user && cardIds.length > 0, staleTime: 60000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_profile_cards', { _ids: cardIds });
      if (error) throw error;
      return new Map((data as Card[]).map(card => [card.id, card]));
    },
  });
  const Identity = ({ id, name, fallback }: { id: string; name: string | null; fallback?: string }) => {
    const card = cards.data?.get(id);
    const sub = [card?.office_name, card?.license_number ? `רישיון ${card.license_number}` : null].filter(Boolean).join(' · ');
    return <span className="min-w-0 flex-1">
      <span className="flex min-w-0 items-center gap-1.5"><span className="truncate font-semibold">{card?.full_name ?? name}</span>{card && <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[11px]">{ROLE_BADGE[card.category] ?? 'משתמש'}</Badge>}</span>
      {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
      {fallback !== undefined && <span className="block truncate text-xs text-muted-foreground">{fallback}</span>}
    </span>;
  };
  return <Tabs dir="rtl" value={view} onValueChange={setView} className="flex h-full min-h-0 flex-col gap-2">
    <TabsList className="grid w-full shrink-0 grid-cols-2"><TabsTrigger value="private" className="text-base">שיחות פרטיות</TabsTrigger><TabsTrigger value="groups" className="text-base">קבוצות</TabsTrigger></TabsList>
    <TabsContent value="groups" forceMount className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden"><CommunityGroups key={user?.id} eligible={eligibility.data === true} active={active && view === 'groups'} blockedIds={blocks.data} /></TabsContent>
    <TabsContent value="private" forceMount className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden">
    <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-[20rem_minmax(0,1fr)]">
    <aside className={`${peer ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col border-e border-border`}>
      <div className="m-3 flex shrink-0 gap-2"><div className="relative flex-1">
        <Search className="absolute end-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input aria-label="חיפוש בקהילה" placeholder="חיפוש בקהילה..." className="pe-9" value={search} onChange={event => setSearch(event.target.value)} />
      </div><Button variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="שיחה חדשה ממדריך המשתמשים" disabled={eligibility.data !== true} onClick={() => setDirectoryOpen(true)}><UserPlus className="h-4 w-4" /></Button></div>
      <Dialog open={directoryOpen} onOpenChange={setDirectoryOpen}><DialogContent dir="rtl" aria-describedby={undefined}><DialogHeader><DialogTitle>שיחה חדשה</DialogTitle></DialogHeader><CommunityDirectory enabled={directoryOpen && eligibility.data === true} listClassName="max-h-[55dvh]" onSelect={u => { setPeer({ id: u.id, full_name: u.full_name, avatar_url: u.avatar_url }); setDirectoryOpen(false); }} /></DialogContent></Dialog>
      <div data-route-scroll className="min-h-0 flex-1 overflow-y-auto">
        {(contacts.isLoading || threads.isLoading) && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />}
        {(contacts.isError || threads.isError || eligibility.isError) && <div role="alert" className="p-4 text-destructive">טעינת השיחות נכשלה<Button variant="ghost" onClick={() => { void contacts.refetch(); void threads.refetch(); void eligibility.refetch(); }}>נסה שוב</Button></div>}
        {eligibility.data === false && <p className="p-4 text-sm text-muted-foreground">מועדון הקהילה פתוח לסוכנים, למתווכים וליזמים.</p>}
        {eligibility.data && !contacts.isLoading && !threads.isLoading && !peers.length && <p className="p-4 text-sm text-muted-foreground">לא נמצאו חברי קהילה</p>}
        {peers.map(contact => {
          const last = threads.data?.find(thread => thread.peer_id === contact.id);
          return <div key={contact.id} className={`flex min-h-16 w-full items-center gap-3 border-b border-border px-3 py-3 ${peer?.id === contact.id ? 'bg-muted' : ''}`}>
            <button type="button" className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`פתיחת הפרופיל הציבורי של ${contact.full_name ?? 'חבר קהילה'}`} onClick={() => setProfileId(contact.id)}><Avatar className="h-10 w-10"><AvatarImage src={contact.avatar_url ?? undefined} /><AvatarFallback><Users className="h-4 w-4" /></AvatarFallback></Avatar></button>
            <Button variant="ghost" className="h-auto min-w-0 flex-1 justify-start whitespace-normal p-0 text-start" onClick={() => setProfileId(contact.id)}><Identity id={contact.id} name={contact.full_name} fallback={last?.content ?? 'שיחה חדשה'} /></Button>
            <Button variant="ghost" size="icon" aria-label={`פתיחת שיחה עם ${contact.full_name ?? 'חבר קהילה'}`} onClick={() => setPeer(contact)}><MessageCircle className="h-4 w-4" /></Button>
          </div>;
        })}
      </div>
    </aside>
    <section className={`${peer ? 'flex' : 'hidden lg:flex'} min-h-0 min-w-0 flex-col`}>
      {!peer ? <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground"><MessageCircle className="h-10 w-10" /><span>מועדון הקהילה</span></div> : <>
        <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-border px-3">
          <Button size="icon" variant="ghost" aria-label="חזרה לשיחות הקהילה" className="lg:hidden" onClick={() => setPeer(null)}><ArrowRight className="h-5 w-5" /></Button>
          <button type="button" className="min-w-0 flex-1 text-start hover:underline" aria-label="פתיחת פרופיל ציבורי" onClick={() => setProfileId(peer.id)}><Identity id={peer.id} name={peer.full_name} /></button>
          <DealTermsDialog peerId={peer.id} peerName={cards.data?.get(peer.id)?.full_name ?? peer.full_name} />
          <Button size="icon" variant="ghost" aria-label={blocked ? 'הסרת חסימה' : 'חסימת משתמש'} title={blocked ? 'הסרת חסימה' : 'לא מעוניין לקבל יותר הודעות ממשתמש זה'} onClick={() => setBlockOpen(true)}><Ban className={`h-5 w-5 ${blocked ? 'text-destructive' : ''}`} /></Button>
          <RitaChatButton kind="peer" target={peer.id} />
          <Dialog open={blockOpen} onOpenChange={setBlockOpen}><DialogContent dir="rtl" aria-describedby={undefined}><DialogHeader><DialogTitle>{blocked ? 'הסרת חסימה' : 'לא מעוניין לקבל יותר הודעות ממשתמש זה'}</DialogTitle></DialogHeader><p className="text-muted-foreground">{blocked ? `${peer.full_name ?? 'המשתמש'} יוכל לשלוח לך הודעות שוב.` : `${peer.full_name ?? 'המשתמש'} לא יוכל לשלוח לך הודעות פרטיות, והודעותיו בקבוצות יוסתרו אצלך.`}</p><div className="flex justify-between gap-3"><Button variant="outline" onClick={() => setBlockOpen(false)}>ביטול</Button><Button variant={blocked ? 'default' : 'destructive'} disabled={toggleBlock.isPending} onClick={() => toggleBlock.mutate()}>{blocked ? 'הסרת חסימה' : 'חסימה'}</Button></div></DialogContent></Dialog>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4" role="log" aria-label="הודעות הקהילה">
          {messages.isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin" />}
          {messages.isError && <div role="alert" className="text-destructive">טעינת ההודעות נכשלה<Button variant="ghost" onClick={() => void messages.refetch()}>נסה שוב</Button></div>}
          <div role="note" className="mx-auto mb-4 max-w-md rounded-xl border border-border bg-muted/50 px-3 py-2 text-center text-sm text-muted-foreground"><span className="block text-xs font-semibold">TORAFF · ריטה</span>{DEAL_SAFETY_TIP}</div>
          {messages.data?.map(message => { const mine = message.sender_id === user?.id; return <div key={message.id} className={`mb-3 flex ${mine ? 'justify-start' : 'justify-end'}`}><div className={`max-w-[80%] break-words px-3 py-2 shadow-sm ${mine ? 'rounded-2xl rounded-ss-sm bg-primary text-primary-foreground' : 'rounded-2xl rounded-se-sm border border-border bg-muted text-foreground'}`}><ChatMessageText content={message.content} /><time className="mt-1 block text-end text-xs opacity-70">{new Date(message.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</time></div></div>; })}
          <div ref={endRef} />
        </div>
        <form className="flex shrink-0 gap-2 border-t border-border p-3" onSubmit={event => { event.preventDefault(); submit(); }}>
          <Input aria-label="הודעה לקהילה" placeholder="הקלד הודעה..." maxLength={4000} value={draft} disabled={!eligibility.data} onChange={event => setDrafts(previous => ({ ...previous, [peer.id]: event.target.value }))} className="min-w-0 flex-1" />
          <Button type="submit" size="icon" aria-label="שלח הודעה לקהילה" disabled={!eligibility.data || !communityMessageContent(draft) || send.isPending} className="h-11 w-11 shrink-0">{send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
        </form>
      </>}
    </section>
  </div></TabsContent>
    <CommunityProfileDialog userId={profileId} onOpenChange={open => { if (!open) setProfileId(null); }} />
  </Tabs>;
}