import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Plus, Send, UserMinus, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RitaChatButton } from './RitaChatButton';
import { ChatMessageText } from './ChatMessageText';
import { toast } from 'sonner';

export function CommunityGroups({ eligible }: { eligible: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<{ id: string; name: string; owner_id: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [name, setName] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const groups = useQuery({ queryKey: ['community-groups', user?.id], enabled: !!user, refetchInterval: 15000, queryFn: async () => {
    const { data, error } = await supabase.from('community_chat_groups').select('id,name,owner_id').order('created_at', { ascending: false }); if (error) throw error; return data;
  }});
  const contacts = useQuery({ queryKey: ['community-contacts', user?.id, ''], enabled: eligible, queryFn: async () => {
    const { data, error } = await supabase.rpc('community_chat_contacts', { _search: '' }); if (error) throw error; return data;
  }});
  const roster = useQuery({ queryKey: ['community-roster', selected?.id], enabled: !!selected, refetchInterval: 15000, queryFn: async () => {
    if (!selected) return []; const { data, error } = await supabase.rpc('community_group_roster', { _group: selected.id }); if (error) throw error; return data;
  }});
  const messages = useQuery({ queryKey: ['community-group-messages', selected?.id], enabled: !!selected, refetchInterval: 15000, queryFn: async () => {
    if (!selected) return []; const { data, error } = await supabase.from('community_group_messages').select('*').eq('group_id', selected.id).order('created_at', { ascending: false }).limit(200); if (error) throw error; return data.reverse();
  }});
  const refresh = async () => { for (const key of ['community-groups', 'community-roster', 'community-group-messages']) await qc.invalidateQueries({ queryKey: [key] }); };
  const create = async () => {
    setBusy(true);
    try { const { data, error } = await supabase.rpc('create_community_chat_group', { _name: name.trim(), _members: members }); if (error) throw error; setCreateOpen(false); setSelected({ id: data, name: name.trim(), owner_id: user?.id ?? '' }); setName(''); setMembers([]); await refresh(); }
    catch { toast.error('יצירת הקבוצה נכשלה'); } finally { setBusy(false); }
  };
  const send = async () => {
    if (!selected || !user || busy) return; const text = (drafts[selected.id] ?? '').trim(); if (!text) return;
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
  return <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-[20rem_minmax(0,1fr)]">
    <aside className={`${selected ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col border-e border-border`}>
      <div className="flex items-center justify-between border-b border-border p-3"><span className="font-semibold">קבוצות הקהילה</span><Button variant="ghost" size="icon" title="קבוצה חדשה" aria-label="קבוצה חדשה" disabled={!eligible} onClick={() => setCreateOpen(true)}><Plus className="h-5 w-5" /></Button></div>
      <div className="min-h-0 flex-1 overflow-y-auto">{groups.data?.map(group => <Button key={group.id} variant="ghost" className="h-16 w-full justify-start gap-3 rounded-none border-b border-border" onClick={() => setSelected(group)}><Users className="h-5 w-5 shrink-0" /><span className="truncate">{group.name}</span></Button>)}{!groups.isLoading && !groups.data?.length && <p className="p-4 text-sm text-muted-foreground">אין קבוצות</p>}{groups.isError && <p role="alert" className="p-4 text-destructive">טעינת הקבוצות נכשלה</p>}</div>
    </aside>
    <section className={`${selected ? 'flex' : 'hidden lg:flex'} min-h-0 min-w-0 flex-col`}>
      {!selected ? <div className="flex flex-1 items-center justify-center text-muted-foreground">קבוצות הקהילה</div> : <>
        <header className="flex min-h-16 shrink-0 items-center gap-2 border-b border-border px-3"><Button size="icon" variant="ghost" aria-label="חזרה לקבוצות" className="lg:hidden" onClick={() => setSelected(null)}><ArrowRight className="h-5 w-5" /></Button><span className="min-w-0 flex-1 truncate font-semibold">{selected.name}</span><Button size="icon" variant="ghost" aria-label="חברי הקבוצה" onClick={() => setRosterOpen(true)}><Users className="h-5 w-5" /></Button>{allowed && <RitaChatButton kind="group" target={selected.id} />}</header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3" role="log" aria-label="הודעות הקבוצה">{!allowed && !roster.isLoading && <p role="alert" className="text-muted-foreground">אינך חבר בקבוצה זו</p>}{allowed && messages.data?.map(message => <div key={message.id} className="mb-3 border-b border-border pb-3"><span className="text-xs font-semibold text-muted-foreground">{roster.data?.find(member => member.user_id === message.sender_id)?.full_name ?? 'חבר קבוצה'}</span><ChatMessageText content={message.content} /></div>)}{messages.isError && <p role="alert" className="text-destructive">טעינת ההודעות נכשלה</p>}</div>
        <form className="flex shrink-0 gap-2 border-t border-border p-3" onSubmit={event => { event.preventDefault(); void send(); }}><Input aria-label="הודעה לקבוצה" placeholder="הקלד הודעה..." maxLength={4000} value={drafts[selected.id] ?? ''} onChange={event => setDrafts(previous => ({ ...previous, [selected.id]: event.target.value }))} disabled={!allowed || !eligible} className="min-w-0 flex-1" /><Button type="submit" size="icon" aria-label="שלח לקבוצה" disabled={!allowed || !eligible || busy || !(drafts[selected.id] ?? '').trim()}><Send className="h-4 w-4" /></Button></form>
      </>}
    </section>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent dir="rtl" aria-describedby={undefined}><DialogHeader><DialogTitle>קבוצה חדשה</DialogTitle></DialogHeader><Input aria-label="שם הקבוצה" placeholder="שם הקבוצה" maxLength={100} value={name} onChange={event => setName(event.target.value)} /><div className="max-h-64 space-y-3 overflow-y-auto">{contacts.data?.map(contact => <label key={contact.id} className="flex items-center gap-3"><Checkbox checked={members.includes(contact.id)} onCheckedChange={checked => setMembers(previous => checked ? [...previous, contact.id] : previous.filter(id => id !== contact.id))} /><span>{contact.full_name}</span></label>)}</div><Button disabled={busy || !name.trim() || !members.length} onClick={() => void create()}>יצירת קבוצה</Button></DialogContent></Dialog>
    <Dialog open={rosterOpen} onOpenChange={setRosterOpen}><DialogContent dir="rtl" aria-describedby={undefined}><DialogHeader><DialogTitle>חברי הקבוצה</DialogTitle></DialogHeader><div className="max-h-80 overflow-y-auto">{roster.data?.map(member => <div key={member.user_id} className="flex items-center justify-between py-2"><span>{member.full_name}</span>{selected?.owner_id === user?.id && member.user_id !== user?.id && <Button size="icon" variant="ghost" aria-label={`הסרת ${member.full_name}`} disabled={busy} onClick={() => void manage(member.user_id, false)}><UserMinus className="h-4 w-4" /></Button>}</div>)}{selected?.owner_id === user?.id && contacts.data?.filter(contact => !roster.data?.some(member => member.user_id === contact.id)).map(contact => <Button key={contact.id} variant="ghost" className="w-full justify-start gap-2" disabled={busy} onClick={() => void manage(contact.id, true)}><Plus className="h-4 w-4" />{contact.full_name}</Button>)}</div></DialogContent></Dialog>
  </div>;
}