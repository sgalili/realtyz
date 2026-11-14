import { SwipeChatCard } from './SwipeChatCard';
import { CommunityAutopilotReplies } from './CommunityAutopilotReplies';
import { useCommunityConversationSettings } from '@/hooks/useCommunityConversationSettings';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { WhatsAppTicks } from './WhatsAppTicks';
import { ChatHeaderActions } from './ChatHeaderActions';
import { useChatReceipts } from '@/hooks/useChatReceipts';
import { unreadIncoming } from '@/lib/chatReceipts';
import { useEffect, useRef, useState } from 'react';
import { PublicIdentityLink } from '@/components/community/PublicIdentityLink';
import { useNavigate, useSearchParams } from 'react-router-dom';

type Card = { id: string; full_name: string | null; category: string; office_name: string | null; license_number: string | null };
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Ban, Star, X, SlidersHorizontal, UserPlus, Loader2, MessageCircle, Search, Send, Users } from 'lucide-react';
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
import { CommunityDirectory } from './CommunityDirectory';
import { useCommunityGenders } from '@/hooks/useCommunityGenders';
import { professionalRole } from '../../../supabase/functions/_shared/personalLanguage';
import { Badge } from '@/components/ui/badge';
import { playSoftDing, showGroupedChatNotification } from '@/lib/communityNotify';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RitaChatButton } from './RitaChatButton';
import { CommunityProfileDialog } from './CommunityProfileDialog';
import { DealTermsDialog } from './DealTermsDialog';
import { DEAL_SAFETY_TIP } from '@/lib/communityChat';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ClearFilterButton } from '@/components/ui/clear-filter-button';
import { AnimatePresence, motion } from 'framer-motion';
import { useInboxFavorites } from '@/hooks/useInboxFavorites';
import { ChatFavoriteButton } from './ChatFavoriteButton';
import { InboxFavoritesDialog } from './InboxFavoritesDialog';
import { DIRECTORY_CATEGORIES } from './CommunityDirectory';

type Peer = { id: string; full_name: string | null; avatar_url: string | null };

export function CommunityInbox({ active }: { active: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const workspace = useActiveWorkspaceOwnerId();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [params] = useSearchParams();
  const [view, setView] = useState(params.has('group') ? 'groups' : 'private');
  useEffect(() => { if (params.has('group')) setView('groups'); }, [params]);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [category, setCategory] = useState('all');
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const favorites = useInboxFavorites();
  const settings = useCommunityConversationSettings('peer');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  useEffect(() => { const add = () => { if (active) setDirectoryOpen(true); }; window.addEventListener('inbox:add-user', add); return () => window.removeEventListener('inbox:add-user', add); }, [active]);
  useEffect(() => {
    const toggle = () => { if (active) setSearchOpen(v => !v); };
    const saved = () => { if (active) setFavoritesOpen(true); };
    const report = () => active && window.dispatchEvent(new CustomEvent('inbox:search-state', { detail: { section: 'community', open: searchOpen } }));
    window.addEventListener('inbox:toggle-search', toggle);
    window.addEventListener('inbox:open-favorites', saved);
    window.addEventListener('inbox:request-search-state', report);
    if (active) report();
    return () => { window.removeEventListener('inbox:toggle-search', toggle); window.removeEventListener('inbox:open-favorites', saved); window.removeEventListener('inbox:request-search-state', report); };
  }, [active, searchOpen]);
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
  const previews = useQuery({ queryKey: ['community-preview-messages', user?.id], enabled: !!user, refetchInterval: 3000, queryFn: async () => {
    const { data, error } = await supabase.from('community_chat_messages').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    return data;
  } });
  const previewReceipts = useChatReceipts('peer', (previews.data ?? []).map(m => ({ id: m.id, incoming: m.recipient_id === user?.id })), false);
  const receipts = useChatReceipts('peer', (messages.data ?? []).map(m => ({ id: m.id, incoming: m.recipient_id === user?.id })), active && view === 'private' && !!peer);
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
  const genders = useCommunityGenders(peers.map(p => p.id));
  const Identity = ({ id, name, fallback, unread, messageId, outgoing }: { id: string; name: string | null; fallback?: string; unread?: boolean; messageId?: string; outgoing?: boolean }) => {
    const card = cards.data?.get(id);
    const sub = [card?.office_name, card?.license_number ? `רישיון ${card.license_number}` : null].filter(Boolean).join(' · ');
    return <span className="min-w-0 flex-1">
      <span className="flex min-w-0 items-center gap-1.5"><span className="truncate font-semibold">{card?.full_name ?? name}</span>{card && <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[11px]">{professionalRole(card.category, genders.data?.get(id) ?? null)}</Badge>}</span>
      {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
      {fallback !== undefined && <span className={`flex items-center gap-1 text-xs ${unread ? 'font-bold text-foreground' : 'font-normal text-muted-foreground'}`}>{outgoing && messageId && <WhatsAppTicks status={previewReceipts.status(messageId)} />}<span className="truncate">{fallback}</span></span>}
    </span>;
  };
  return <Tabs dir="rtl" value={view} onValueChange={setView} className="flex h-full min-h-0 flex-col gap-2">
    <div className={`${favoritesOpen ? "hidden" : "grid"} shrink-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-1`} data-community-tab-toolbar>
      <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={searchOpen ? 'סגירת חיפוש בקהילה' : 'חיפוש בקהילה'} title={searchOpen ? 'סגירת חיפוש' : 'חיפוש בקהילה'} onClick={() => setSearchOpen(v => !v)}>{searchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}</Button>
      <TabsList className="grid w-full min-w-0 grid-cols-2"><TabsTrigger value="private" className="px-1 text-base">שיחות פרטיות</TabsTrigger><TabsTrigger value="groups" className="px-1 text-base">קבוצות</TabsTrigger></TabsList>
      <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="מועדפי הקהילה" title="מועדפים" onClick={() => setFavoritesOpen(true)}><Star className="h-5 w-5" /></Button>
    </div>
      <AnimatePresence initial={false}>{searchOpen && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="shrink-0 overflow-hidden border-b"><div className="space-y-2 p-3"><ClearFilterButton active={!!search.trim() || category !== 'all'} onClear={() => { setSearch(''); setCategory('all'); }} /><div className="flex gap-2"><Input aria-label="חיפוש בקהילה" placeholder="שם חבר קהילה..." value={search} onChange={e => setSearch(e.target.value)} /><Button variant={filtersOpen ? 'default' : 'outline'} size="icon" className="shrink-0" aria-label="סינון חברי קהילה" title="סינון חברי קהילה" onClick={() => setFiltersOpen(v => !v)}><SlidersHorizontal className="h-4 w-4" /></Button></div>{filtersOpen && <div className="flex flex-wrap gap-1">{DIRECTORY_CATEGORIES.map(c => <Button key={c.value} size="sm" variant={category === c.value ? 'default' : 'outline'} onClick={() => setCategory(c.value)}>{c.label}</Button>)}</div>}</div></motion.div>}</AnimatePresence>
      <InboxFavoritesDialog open={favoritesOpen} onOpenChange={setFavoritesOpen} community />
    <TabsContent value="groups" forceMount className={`${favoritesOpen ? "hidden" : ""} m-0 min-h-0 flex-1 data-[state=inactive]:hidden`}><CommunityGroups key={user?.id} eligible={eligibility.data === true} active={active && view === 'groups'} blockedIds={blocks.data} /></TabsContent>
    <TabsContent value="private" forceMount className={`${favoritesOpen ? "hidden" : ""} m-0 min-h-0 flex-1 data-[state=inactive]:hidden`}>
    <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-[20rem_minmax(0,1fr)]">
    <aside className={`${peer ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col border-e border-border`}>


      <div data-route-scroll className="min-h-0 flex-1 overflow-y-auto">
        {(contacts.isLoading || threads.isLoading) && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />}
        {(contacts.isError || threads.isError || eligibility.isError) && <div role="alert" className="p-4 text-destructive">טעינת השיחות נכשלה<Button variant="ghost" onClick={() => { void contacts.refetch(); void threads.refetch(); void eligibility.refetch(); }}>נסה שוב</Button></div>}
        {eligibility.data === false && <p className="p-4 text-sm text-muted-foreground">מועדון הקהילה פתוח לסוכנים, למתווכים וליזמים.</p>}
        {eligibility.data && !contacts.isLoading && !threads.isLoading && !peers.length && <p className="p-4 text-sm text-muted-foreground">לא נמצאו חברי קהילה</p>}
        {peers.filter(contact => !settings.hidden(contact.id, threads.data?.find(t => t.peer_id === contact.id)?.created_at) && (category === 'all' || cards.data?.get(contact.id)?.category === category)).map(contact => {
          const last = threads.data?.find(thread => thread.peer_id === contact.id);
          const latest = previews.data?.find(m => (m.sender_id === contact.id || m.recipient_id === contact.id));
          return <SwipeChatCard key={contact.id} kind="peer" id={contact.id} onDelete={() => setDeleteTarget(contact.id)} autopilot={settings.enabled(contact.id)} onAutopilot={() => void settings.change(contact.id, 'autopilot', !settings.enabled(contact.id))} busy={settings.busy === contact.id}><div role="button" tabIndex={0} aria-label={`פתיחת שיחה עם ${contact.full_name ?? 'חבר קהילה'}`} onClick={() => setPeer(contact)} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setPeer(contact); } }} className={`flex min-h-16 w-full items-center gap-3 border-b border-border px-3 py-3 ${peer?.id === contact.id ? 'bg-muted' : ''}`}>
            <button type="button" className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`פתיחת הפרופיל הציבורי של ${contact.full_name ?? 'חבר קהילה'}`} onClick={e => { e.stopPropagation(); navigate(`/community/profile/${contact.id}`, { state: { returnTo: window.location.pathname + window.location.search } }); }}><Avatar className="h-10 w-10"><AvatarImage src={contact.avatar_url ?? undefined} /><AvatarFallback><Users className="h-4 w-4" /></AvatarFallback></Avatar></button>
            <Identity id={contact.id} name={contact.full_name} fallback={last?.content ?? undefined} messageId={latest?.id} outgoing={latest?.sender_id === user?.id} unread={!!latest && unreadIncoming(latest.recipient_id === user?.id, previewReceipts.isRead(latest.id))} />

          </div></SwipeChatCard>;
        })}
      </div>
    </aside>
    <section className={`${peer ? 'flex' : 'hidden lg:flex'} min-h-0 min-w-0 flex-col`}>
      {!peer ? <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground"><MessageCircle className="h-10 w-10" /><span>מועדון הקהילה</span></div> : <>
        <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-border px-3">
          <Button size="icon" variant="ghost" aria-label="חזרה לשיחות הקהילה" className="lg:hidden" onClick={() => setPeer(null)}><ArrowRight className="h-5 w-5" /></Button>
          <div className="min-w-0 flex-1 text-start"><PublicIdentityLink userId={peer.id} label="פתיחת פרופיל ציבורי" className="block"><span className="font-semibold">{cards.data?.get(peer.id)?.full_name ?? peer.full_name}</span>{cards.data?.get(peer.id) && <Badge variant="secondary" className="ms-2">{professionalRole(cards.data.get(peer.id)?.category ?? '', genders.data?.get(peer.id) ?? null)}</Badge>}</PublicIdentityLink><span className="block truncate text-xs text-muted-foreground"><PublicIdentityLink userId={peer.id} office>{cards.data?.get(peer.id)?.office_name}</PublicIdentityLink>{cards.data?.get(peer.id)?.license_number && <span className="ms-2">{cards.data.get(peer.id)?.license_number}</span>}</span></div>
          <ChatHeaderActions>
            <ChatFavoriteButton label kind="peer" id={peer.id} />
            <DealTermsDialog peerId={peer.id} peerName={cards.data?.get(peer.id)?.full_name ?? peer.full_name} label />
            <Button variant="ghost" onClick={() => setBlockOpen(true)}><Ban className={`h-5 w-5 ${blocked ? 'text-destructive' : ''}`} />{blocked ? 'הסרת חסימה' : 'חסימת משתמש'}</Button>
            <RitaChatButton kind="peer" target={peer.id} label />
          </ChatHeaderActions>

    <Dialog open={blockOpen} onOpenChange={setBlockOpen}><DialogContent dir="rtl" aria-describedby={undefined}><DialogHeader><DialogTitle>{blocked ? 'הסרת חסימה' : 'לא מעוניין לקבל יותר הודעות ממשתמש זה'}</DialogTitle></DialogHeader><p className="text-muted-foreground">{blocked ? `${peer.full_name ?? 'המשתמש'} יוכל לשלוח לך הודעות שוב.` : `${peer.full_name ?? 'המשתמש'} לא יוכל לשלוח לך הודעות פרטיות, והודעותיו בקבוצות יוסתרו אצלך.`}</p><div className="flex justify-between gap-3"><Button variant="outline" onClick={() => setBlockOpen(false)}>ביטול</Button><Button variant={blocked ? 'default' : 'destructive'} disabled={toggleBlock.isPending} onClick={() => toggleBlock.mutate()}>{blocked ? 'הסרת חסימה' : 'חסימה'}</Button></div></DialogContent></Dialog>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4" role="log" aria-label="הודעות הקהילה">
          {messages.isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin" />}
          {messages.isError && <div role="alert" className="text-destructive">טעינת ההודעות נכשלה<Button variant="ghost" onClick={() => void messages.refetch()}>נסה שוב</Button></div>}
          <div role="note" className="mx-auto mb-4 max-w-md rounded-xl border border-border bg-muted/50 px-3 py-2 text-center text-sm text-muted-foreground"><span className="block text-xs font-semibold">TORAFF · ריטה</span>{DEAL_SAFETY_TIP}</div>
          {messages.data?.map(message => { const mine = message.sender_id === user?.id; return <div key={message.id} className={`mb-3 flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[80%] break-words px-3 py-2 shadow-sm ${mine ? 'rounded-lg rounded-ee-sm bg-muted text-foreground' : 'rounded-lg rounded-es-sm bg-primary text-primary-foreground'}`}><ChatMessageText content={message.content} /><span className="mt-1 flex items-center justify-end gap-1 text-xs"><time className="opacity-70">{new Date(message.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</time>{mine && <WhatsAppTicks status={receipts.status(message.id)} />}</span></div></div>; })}
          <CommunityAutopilotReplies kind="peer" target={peer.id} /><div ref={endRef} />
        </div>
        <form className="flex shrink-0 gap-2 border-t border-border p-3" onSubmit={event => { event.preventDefault(); submit(); }}>
          <Input aria-label="הודעה לקהילה" placeholder="הקלד הודעה..." maxLength={4000} value={draft} disabled={!eligibility.data} onChange={event => setDrafts(previous => ({ ...previous, [peer.id]: event.target.value }))} className="min-w-0 flex-1" />
          <Button type="submit" size="icon" aria-label="שלח הודעה לקהילה" disabled={!eligibility.data || !communityMessageContent(draft) || send.isPending} className="h-11 w-11 shrink-0">{send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
        </form>
      </>}
    </section>
  </div></TabsContent>
    <Dialog open={directoryOpen} onOpenChange={setDirectoryOpen}><DialogContent dir="rtl" aria-describedby={undefined}><DialogHeader><DialogTitle>חברי הקהילה</DialogTitle></DialogHeader><CommunityDirectory enabled={directoryOpen && eligibility.data === true} listClassName="max-h-[55dvh]" onSelect={u => { setView('private'); setPeer({ id: u.id, full_name: u.full_name, avatar_url: u.avatar_url }); setDirectoryOpen(false); }} /></DialogContent></Dialog>
          <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>להסיר את השיחה מהרשימה?</AlertDialogTitle><AlertDialogDescription>ההיסטוריה נשמרת למשתתפים. הודעה חדשה תחזיר את השיחה לרשימה. ריטה תכובה לשיחה זו.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter className="flex-row justify-between gap-3"><AlertDialogCancel>ביטול</AlertDialogCancel><AlertDialogAction disabled={!!settings.busy} onClick={event => { event.preventDefault(); if (deleteTarget) void settings.change(deleteTarget, 'hide').then(saved => { if (saved) { if (peer?.id === deleteTarget) setPeer(null); setDeleteTarget(null); } }); }}>הסרה</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <CommunityProfileDialog userId={profileId} onOpenChange={open => { if (!open) setProfileId(null); }} />
  </Tabs>;
}