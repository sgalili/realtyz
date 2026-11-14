import { WhatsAppTicks } from './WhatsAppTicks';
import { ChatFavoriteButton } from './ChatFavoriteButton';
import { ChatHeaderActions } from './ChatHeaderActions';
import { useInboxFavorites } from '@/hooks/useInboxFavorites';
import { useSearchParams } from 'react-router-dom';
import { useChatReceipts } from '@/hooks/useChatReceipts';
import { CommunityDirectory } from './CommunityDirectory';
import { CommunityProfileDialog } from './CommunityProfileDialog';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Plus, Send, UserMinus, Users, Radio, Crown, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { canPostToGroup, partitionCommunityGroups, type CommunityGroup } from '@/lib/communityGroups';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RitaChatButton } from './RitaChatButton';
import { ChatMessageText } from './ChatMessageText';
import { toast } from 'sonner';
import { playSoftDing, showGroupedChatNotification } from '@/lib/communityNotify';

export function CommunityGroups({ eligible, active, blockedIds }: { eligible: boolean; active: boolean; blockedIds?: Set<string> }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const favorites = useInboxFavorites();
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<CommunityGroup | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState('discussion');
  const [search, setSearch] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const [members, setMembers] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const groups = useQuery({ queryKey: ['community-groups', user?.id], enabled: !!user, refetchInterval: 15000, queryFn: async () => {
    const { data, error } = await supabase.rpc('community_joined_groups'); if (error) throw error; return data;
  }});
  useEffect(() => { const target = params.get('group'); const group = groups.data?.find(g => g.id === target); if (group) setSelected(group); }, [params, groups.data]);
  const roster = useQuery({ queryKey: ['community-roster', user?.id, selected?.id], enabled: !!selected, refetchInterval: 15000, queryFn: async () => {
    if (!selected) return []; const { data, error } = await supabase.rpc('community_group_roster', { _group: selected.id }); if (error) throw error; return data;
  }});
  const messages = useQuery({ queryKey: ['community-group-messages', user?.id, selected?.id], enabled: !!selected, refetchInterval: 15000, queryFn: async () => {
    if (!selected) return []; const { data, error } = await supabase.from('community_group_messages').select('*').eq('group_id', selected.id).order('created_at', { ascending: false }).limit(200); if (error) throw error; return data.reverse();
  }});
  const previews = useQuery({ queryKey: ['community-group-previews', user?.id], enabled: !!user, refetchInterval: 3000, queryFn: async () => {
    const { data, error } = await supabase.from('community_group_messages').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    return data;
  } });
  const previewReceipts = useChatReceipts('group', (previews.data ?? []).filter(m => !blockedIds?.has(m.sender_id)).map(m => ({ id: m.id, incoming: m.sender_id !== user?.id })), false);
  const receipts = useChatReceipts('group', (messages.data ?? []).filter(m => !blockedIds?.has(m.sender_id)).map(m => ({ id: m.id, incoming: m.sender_id !== user?.id })), active && !!selected);
  const refresh = async () => { for (const key of ['community-groups', 'community-roster', 'community-group-messages']) await qc.invalidateQueries({ queryKey: [key] }); };
  const create = async () => {
    setBusy(true);
    try { const { data, error } = await supabase.rpc('create_community_channel', { _name: name.trim(), _description: description.trim(), _kind: kind, _members: members }); if (error) throw error; setCreateOpen(false); setSelected({ id: data, name: name.trim(), description: description.trim(), kind, unread_count: 0, owner_id: user?.id ?? '' }); setName(''); setDescription(''); setMembers([]); setSearch(''); await refresh(); toast.success(kind === 'broadcast' ? 'ערוץ השידור נוצר' : 'הקבוצה נוצרה'); }
    catch { toast.error('יצירת הקבוצה נכשלה'); } finally { setBusy(false); }
  };
  const send = async () => {
    if (!selected || !user || busy || !canPostToGroup(selected, user.id, !!roster.data?.some(member => member.user_id === user.id), eligible)) return; const text = (drafts[selected.id] ?? '').trim(); if (!text) return;
    const target = selected.id; setBusy(true);
    try { const { error } = await supabase.from('community_group_messages').insert({ group_id: target, sender_id: user.id, content: text }); if (error) throw error; setDrafts(previous => ({ ...previous, [target]: '' })); await refresh(); }
    catch { toast.error('שליחת ההודעה נכשלה'); } finally { setBusy(false); }
  };
  const manage = async (member: string, add: boolean) => {
    if (!selected || busy) return; setBusy(true);
    try { const { error } = await supabase.rpc('manage_community_group_member', { _group: selected.id, _member: member, _add: add }); if (error) throw error; await refresh(); }
    catch { toast.error('עדכון החברים נכשל'); } finally { setBusy(false); }
  };
  const allowed = !!selected && roster.data?.some(member => member.user_id === user?.id);
  const canPost = !!selected && canPostToGroup(selected, user?.id, !!allowed, eligible);
  const sections = partitionCommunityGroups(groups.data ?? [], user?.id);
  const lastMessage = messages.data?.at(-1);
  useEffect(() => {
    if (!active || !allowed || !selected || !lastMessage || !user) return;
    const markRead = () => {
      if (document.visibilityState !== 'visible') return;
      void supabase.rpc('mark_community_group_read', { _group: selected.id, _message: lastMessage.id }).then(({ error }) => {
        if (!error) void qc.invalidateQueries({ queryKey: ['community-groups', user.id] });
      });
    };
    markRead();
    document.addEventListener('visibilitychange', markRead);
    return () => document.removeEventListener('visibilitychange', markRead);
  }, [active, allowed, selected?.id, lastMessage?.id, user?.id, qc]);
  const unreadSeen = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    if (!groups.data) return;
    const first = unreadSeen.current === null;
    let ding = false;
    const next = new Map<string, number>();
    for (const group of groups.data) {
      next.set(group.id, group.unread_count);
      const before = unreadSeen.current?.get(group.id) ?? 0;
      if (first || group.unread_count <= before || (active && selected?.id === group.id)) continue;
      ding = true;
      showGroupedChatNotification(`group-${group.id}`, group.name, group.unread_count, null, () => setSelected(group));
    }
    unreadSeen.current = next;
    if (ding) playSoftDing();
  }, [groups.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (active) endRef.current?.scrollIntoView({ block: 'nearest' }); }, [active, selected?.id, lastMessage?.id]);
  return <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-[20rem_minmax(0,1fr)]">
    <aside className={`${selected ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col border-e border-border`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3"><span className="font-semibold">קבוצות הקהילה</span><Button variant="outline" className="min-h-11 gap-1" disabled={!eligible} onClick={() => { setSearch(''); setCreateOpen(true); }}><Plus className="h-4 w-4" />קבוצה חדשה</Button></div>
      <div className="min-h-0 flex-1 overflow-y-auto">{(['managed', 'joined'] as const).map(section => sections[section].length > 0 && <div key={section}><h3 className="px-3 py-2 text-sm font-semibold text-muted-foreground">{section === 'managed' ? 'בניהולי' : 'קבוצות שהצטרפתי אליהן'}</h3>{sections[section].map(group => { const latest = previews.data?.find(m => m.group_id === group.id && !blockedIds?.has(m.sender_id)); const unread = latest && latest.sender_id !== user?.id && !previewReceipts.isRead(latest.id); return <Button key={group.id} variant="ghost" className={`h-20 w-full justify-start gap-3 rounded-none border-b border-border text-start ${selected?.id === group.id ? 'bg-muted' : ''}`} onClick={() => setSelected(group)}>{group.kind === 'broadcast' ? <Radio className="h-5 w-5 shrink-0" /> : <Users className="h-5 w-5 shrink-0" />}<span className="min-w-0 flex-1"><span className="block truncate font-semibold">{group.name}</span><span className={`flex min-w-0 items-center gap-1 text-xs ${unread ? 'font-bold text-foreground' : 'font-normal text-muted-foreground'}`}>{latest?.sender_id === user?.id && <WhatsAppTicks status={previewReceipts.status(latest.id)} />}<span className="truncate">{latest?.content ?? group.description ?? (group.kind === 'broadcast' ? 'ערוץ שידור' : 'קבוצת דיון')}</span></span></span>{section === 'managed' && <Crown className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="בניהולי" />}{group.unread_count > 0 && <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground" aria-label={`${group.unread_count} הודעות שלא נקראו`}>{group.unread_count > 99 ? '99+' : group.unread_count}</span>}</Button>; })}</div>)}{!groups.isLoading && !groups.data?.length && <p className="p-4 text-sm text-muted-foreground">אין קבוצות</p>}{groups.isError && <p role="alert" className="p-4 text-destructive">טעינת הקבוצות נכשלה</p>}</div>
    </aside>
    <section className={`${selected ? 'flex' : 'hidden lg:flex'} min-h-0 min-w-0 flex-col`}>
      {!selected ? <div className="flex flex-1 items-center justify-center text-muted-foreground">קבוצות הקהילה</div> : <>
        <header className="flex min-h-16 shrink-0 items-center gap-2 border-b border-border px-3"><Button size="icon" variant="ghost" aria-label="חזרה לקבוצות" className="lg:hidden" onClick={() => setSelected(null)}><ArrowRight className="h-5 w-5" /></Button><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{selected.name}</span><span className="block truncate text-xs text-muted-foreground">{selected.description}</span></span><ChatHeaderActions><ChatFavoriteButton label kind="group" id={selected.id} /><Button variant="ghost" onClick={() => { setSearch(''); setRosterOpen(true); }}><Users className="h-5 w-5" />חברי הקבוצה</Button>{canPost && <RitaChatButton kind="group" target={selected.id} label />}</ChatHeaderActions></header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3" role="log" aria-label="הודעות הקבוצה">{!allowed && !roster.isLoading && <p role="alert" className="text-muted-foreground">אינך חבר בקבוצה זו</p>}{allowed && messages.data?.filter(message => !blockedIds?.has(message.sender_id)).map(message => { const mine = message.sender_id === user?.id; return <div key={message.id} className={`mb-3 flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[80%] break-words px-3 py-2 shadow-sm ${mine ? 'rounded-lg rounded-ee-sm bg-muted text-foreground' : 'rounded-lg rounded-es-sm bg-primary text-primary-foreground'}`}>{!mine && <button type="button" className="block text-xs font-semibold text-inherit hover:underline" onClick={() => setProfileId(message.sender_id)}>{roster.data?.find(member => member.user_id === message.sender_id)?.full_name ?? 'חבר קבוצה'}</button>}<ChatMessageText content={message.content} /><span className="mt-1 flex items-center justify-end gap-1 text-xs"><time className="opacity-70">{new Date(message.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</time>{mine && <WhatsAppTicks status={receipts.status(message.id)} />}</span></div></div>; })}{messages.isError && <p role="alert" className="text-destructive">טעינת ההודעות נכשלה</p>}<div ref={endRef} /></div>
        {allowed && selected.kind === 'broadcast' && selected.owner_id !== user?.id ? <p className="border-t border-border p-3 text-center text-sm text-muted-foreground">ערוץ שידור · רק מנהל הערוץ יכול לפרסם</p> : <form className="flex shrink-0 gap-2 border-t border-border p-3" onSubmit={event => { event.preventDefault(); void send(); }}><Input aria-label="הודעה לקבוצה" placeholder="הקלד הודעה..." maxLength={4000} value={drafts[selected.id] ?? ''} onChange={event => setDrafts(previous => ({ ...previous, [selected.id]: event.target.value }))} disabled={!canPost} className="min-w-0 flex-1" /><Button type="submit" size="icon" className="h-11 w-11 shrink-0" aria-label="שלח לקבוצה" disabled={!canPost || busy || !(drafts[selected.id] ?? '').trim()}><Send className="h-4 w-4" /></Button></form>}
      </>}
    </section>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent dir="rtl" className="max-h-[90dvh] overflow-y-auto" aria-describedby={undefined}><DialogHeader><DialogTitle>יצירת קבוצה חדשה</DialogTitle></DialogHeader><Tabs value={kind} onValueChange={setKind} dir="rtl"><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="discussion"><Users className="me-2 h-4 w-4" />קבוצת דיון</TabsTrigger><TabsTrigger value="broadcast"><Radio className="me-2 h-4 w-4" />ערוץ שידור</TabsTrigger></TabsList></Tabs><Input aria-label="שם הקבוצה" placeholder="שם הקבוצה" maxLength={100} value={name} onChange={event => setName(event.target.value)} /><Textarea aria-label="תיאור הקבוצה" placeholder="תיאור הקבוצה" maxLength={1000} value={description} onChange={event => setDescription(event.target.value)} /><h3 className="font-semibold">הזמנת חברים {members.length > 0 && `(${members.length})`}</h3><CommunityDirectory enabled={eligible && createOpen} listClassName="max-h-56" renderAction={contact => <Checkbox aria-label={`בחירת ${contact.full_name}`} checked={members.includes(contact.id)} disabled={!members.includes(contact.id) && members.length >= 49} onCheckedChange={checked => setMembers(previous => checked ? [...previous, contact.id] : previous.filter(id => id !== contact.id))} />} /><div className="flex justify-between gap-3"><Button variant="outline" onClick={() => setCreateOpen(false)}>ביטול</Button><Button disabled={busy || !name.trim()} onClick={() => void create()}>{kind === 'broadcast' ? 'יצירת ערוץ' : 'יצירת קבוצה'}</Button></div></DialogContent></Dialog>
    <Dialog open={rosterOpen} onOpenChange={setRosterOpen}><DialogContent dir="rtl" aria-describedby={undefined}><DialogHeader><DialogTitle>חברי הקבוצה</DialogTitle></DialogHeader><div className="max-h-80 overflow-y-auto">{roster.data?.map(member => <div key={member.user_id} className="flex items-center justify-between gap-2 py-2"><button type="button" className="min-w-0 break-words text-start hover:underline" onClick={() => setProfileId(member.user_id)}>{member.full_name}</button>{selected?.owner_id === user?.id && member.user_id !== user?.id && <Button size="icon" variant="ghost" aria-label={`הסרת ${member.full_name}`} disabled={busy} onClick={() => void manage(member.user_id, false)}><UserMinus className="h-4 w-4" /></Button>}</div>)}{selected?.owner_id === user?.id && <h3 className="border-t border-border pt-3 font-semibold">הזמנת חברים</h3>}{selected?.owner_id === user?.id && <CommunityDirectory enabled={eligible && rosterOpen} listClassName="max-h-56" exclude={roster.data?.map(member => member.user_id) ?? []} renderAction={contact => <Button size="icon" variant="ghost" aria-label={`הוספת ${contact.full_name}`} disabled={busy} onClick={() => void manage(contact.id, true)}><Plus className="h-4 w-4" /></Button>} />}</div></DialogContent></Dialog>
    <CommunityProfileDialog userId={profileId} onOpenChange={open => { if (!open) setProfileId(null); }} />
  </div>;
}