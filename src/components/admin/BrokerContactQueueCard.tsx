import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Save, Loader2, Mail, UserRoundSearch } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { OfficialBrokerInvitationDialog } from './OfficialBrokerInvitationDialog';
import { BrokerEmailConsentButton } from './BrokerEmailInvitations';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useWorkspace } from '@/hooks/useWorkspace';

export type ContactBroker = { user_id: string; full_name: string; phone: string | null; email: string | null; license_number: string | null; office_name: string | null; office_logo_url?: string | null; avatar_url?: string | null; is_developer?: boolean; drafts: number; contact_status: 'pending_contact' | 'complete'; first_login_at: string | null; email_consent_at: string | null; email_invited_at: string | null };

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) { const d = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null; throw new Error(typeof d?.error === 'string' ? d.error : 'הפעולה נכשלה'); }
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

const DEFAULT_EMAIL = (name: string) => `שלום${name ? ` ${name.split(/\s+/)[0]}` : ''},

חסכנו לך את העבודה והזנו עבורך את פרטי הנכסים. הם שמורים במרחב האישי שלך ב-TORAFF וממתינים לבדיקה שלך.

הנכסים לא יתפרסמו בלי אישורך. אחרי כניסה עם קוד אימות אפשר לעבור עליהם, לתקן פרטים ולקבוע עמלת סגירה ותמחור פניות.`;

function EmailSendDialog({ b }: { b: ContactBroker }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(b.email ?? '');
  const [body, setBody] = useState(() => DEFAULT_EMAIL(b.full_name));
  const saveEmail = useMutation({
    mutationFn: () => invoke('admin-broker-contact', { action: 'save', user_id: b.user_id, email: email.trim() }),
    onSuccess: () => { toast.success('האימייל נשמר'); void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const send = useMutation({
    mutationFn: () => invoke<{ sent: number }>('admin-broker-email-invitation', { action: 'send_batch', broker_id: b.user_id, limit: 1, message: body.trim() }),
    onSuccess: d => { if (d.sent) { toast.success('המייל נשלח'); setOpen(false); } else toast.error('המייל לא נשלח'); void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); void qc.invalidateQueries({ queryKey: ['broker-contact-history'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const emailDirty = email.trim().toLowerCase() !== (b.email ?? '');
  return <>
    <Button variant="outline" className="h-11 text-base" onClick={() => setOpen(true)}><Mail className="h-4 w-4" />שלח מייל</Button>
    <Dialog open={open} onOpenChange={v => { if (!send.isPending) setOpen(v); }}>
      <DialogContent dir="rtl" className="w-[calc(100%-2rem)] max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto text-right">
        <DialogHeader><DialogTitle>שליחת מייל ל{b.full_name || 'מתווך'}</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          <Input aria-label="כתובת אימייל" className="h-11 text-base" dir="ltr" type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          <Button variant="outline" className="h-11" disabled={!email.trim() || !emailDirty || saveEmail.isPending} onClick={() => saveEmail.mutate()}>{saveEmail.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}שמירה</Button>
        </div>
        {b.email && !b.email_consent_at && <div className="flex items-center gap-2 text-sm text-muted-foreground">נדרשת הסכמה מתועדת לפני שליחה:<BrokerEmailConsentButton broker={{ id: b.user_id, full_name: b.full_name, email: b.email }} state={{ email_consent_at: b.email_consent_at, email_unsubscribed_at: null, email_invited_at: b.email_invited_at }} /></div>}
        <Textarea aria-label="נוסח המייל" className="min-h-[200px] text-base" value={body} onChange={e => setBody(e.target.value)} />
        <p className="text-sm text-muted-foreground">קישור הכניסה לנכסים וקישור ההסרה מתווספים אוטומטית בסוף המייל.</p>
        {b.email_invited_at && <p className="text-sm text-muted-foreground">הזמנה כבר נשלחה באימייל למתווך זה.</p>}
        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <Button variant="outline" disabled={send.isPending} onClick={() => setOpen(false)}>ביטול</Button>
          <Button disabled={!b.email || emailDirty || !b.email_consent_at || !!b.email_invited_at || body.trim().length < 10 || send.isPending} onClick={() => send.mutate()}>{send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}שליחה</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function useOpenWorkspace() {
  const { setActiveWorkspace } = useWorkspace();
  const navigate = useNavigate();
  return async (id: string, developer?: boolean) => {
    try { await setActiveWorkspace(id); navigate(developer ? '/developer-dashboard' : '/properties'); } catch { /* toast shown by switcher */ }
  };
}

function BrokerRow({ b }: { b: ContactBroker }) {
  const qc = useQueryClient();
  const openWs = useOpenWorkspace();
  const [phone, setPhone] = useState(b.phone ? formatPhoneDisplay(b.phone) : '');
  const save = useMutation({
    mutationFn: () => invoke<{ complete: boolean }>('admin-broker-contact', { action: 'save', user_id: b.user_id, phone: phone.trim() || undefined }),
    onSuccess: d => { toast.success(d.complete ? 'הפרטים נשמרו · אפשר לשלוח הזמנה' : 'נשמר · עדיין נדרש נייד'); void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const complete = b.contact_status === 'complete' && !!b.phone;
  const dirty = !!phone.trim() && phone.replace(/\D/g, '') !== (b.phone ? formatPhoneDisplay(b.phone).replace(/\D/g, '') : '');
  const dest = b.is_developer ? 'הפרויקטים' : 'הנכסים';
  return <li className="space-y-3 rounded-xl border border-border/70 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <button type="button" onClick={() => void openWs(b.user_id, b.is_developer)} className="flex items-center gap-3 rounded-lg text-right hover:opacity-90" aria-label={`מעבר אל ${dest} של ${b.full_name}`}>
        {b.avatar_url && <img src={b.avatar_url} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />}
        {b.office_logo_url && <img src={b.office_logo_url} alt="" className="h-12 w-12 shrink-0 rounded-md border border-border/60 object-contain" />}
        <div className="space-y-1"><p className="text-lg font-bold">{b.full_name || 'ללא שם'}</p><p className="text-base text-muted-foreground">{[b.license_number && `רישיון ${b.license_number}`, b.office_name, `${b.drafts} טיוטות`].filter(Boolean).join(' · ')}</p></div>
      </button>
      {!complete && <Badge variant="secondary" className="text-sm">ממתין להשלמת פרטי התקשרות</Badge>}
    </div>
    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
      <Input aria-label={`נייד (WhatsApp) של ${b.full_name}`} className="h-11 text-base" dir="ltr" inputMode="tel" placeholder="05X-XXXXXXX" value={phone} onChange={e => setPhone(e.target.value)} />
      <Button className="h-11 text-base" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}שמירה</Button>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {complete && <OfficialBrokerInvitationDialog broker={{ id: b.user_id, full_name: b.full_name }} triggerLabel="שלח וואטסאפ" />}
      <EmailSendDialog b={b} />
    </div>
  </li>;
}

type HistoryItem = { user_id: string; channel: 'whatsapp' | 'email'; status: string; sent_at: string; full_name: string; avatar_url: string | null; office_name: string | null; office_logo_url: string | null };
const STATUS: Record<string, string> = { accepted: 'נשלח', sent: 'נשלח', pending: 'בשליחה', failed: 'נכשל', delivered: 'נמסר', read: 'נקרא' };

function SendHistory() {
  const q = useQuery({ queryKey: ['broker-contact-history'], queryFn: () => invoke<{ items: HistoryItem[] }>('admin-broker-contact', { action: 'history' }) });
  const items = q.data?.items ?? [];
  return <div className="space-y-3 pt-2">
    <h3 className="text-xl font-bold">היסטוריית שליחויות</h3>
    {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : q.isError ? <p role="alert" className="text-base text-destructive">{(q.error as Error).message}</p> : items.length === 0 ? <p className="text-base text-muted-foreground">עדיין לא נשלחו הודעות.</p> :
      <ul className="divide-y divide-border/70 rounded-xl border border-border/70">{items.map((i, n) => <li key={`${i.user_id}-${i.channel}-${n}`} className="flex items-center gap-3 p-3">
        {i.avatar_url ? <img src={i.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" /> : <span className="h-10 w-10 shrink-0" />}
        <div className="min-w-0 flex-1"><p className="truncate text-base font-bold">{i.full_name || 'ללא שם'}</p>{i.office_name && <p className="truncate text-sm text-muted-foreground">{i.office_name}</p>}
          <p className="text-sm text-muted-foreground">{i.channel === 'whatsapp' ? 'וואטסאפ' : 'מייל'} · {STATUS[i.status] ?? i.status} · {new Date(i.sent_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</p></div>
        {i.office_logo_url && <img src={i.office_logo_url} alt="" className="h-10 w-10 shrink-0 rounded-md border border-border/60 object-contain" />}
      </li>)}</ul>}
  </div>;
}

/** Bright Data imported brokers that still need a mobile or email entered by a Super Admin. */
export function BrokerContactQueueCard() {
  const q = useQuery({ queryKey: ['broker-contact-queue'], queryFn: () => invoke<{ brokers: ContactBroker[] }>('admin-broker-contact', { action: 'list' }) });
  const brokers = q.data?.brokers ?? [];
  const pending = brokers.filter(b => b.contact_status === 'pending_contact').length;
  return <section dir="rtl" className="space-y-4 py-5 text-right">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-xl font-bold"><UserRoundSearch className="h-5 w-5 text-primary" />השלמת פרטי התקשרות</h3>{pending > 0 && <Badge variant="secondary" className="text-sm">{pending} ממתינים</Badge>}</div>
    {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : q.isError ? <p role="alert" className="text-base text-destructive">{(q.error as Error).message}</p> : brokers.length === 0 ? <p className="text-base text-muted-foreground">אין מתווכים שממתינים להשלמת פרטים.</p> :
      <ul className="space-y-3">{brokers.map(b => <BrokerRow key={b.user_id} b={b} />)}</ul>}
    <SendHistory />
  </section>;
}
