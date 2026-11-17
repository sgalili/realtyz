import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Save, Loader2, Mail, UserRoundSearch, Pencil, Check, X, ExternalLink, ShieldCheck } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BrokerRegistryNameButton } from './BrokerRegistryNameButton';
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

export type ContactBroker = { user_id: string; full_name: string; phone: string | null; email: string | null; license_number: string | null; office_name: string | null; office_logo_url?: string | null; avatar_url?: string | null; is_developer?: boolean; profile_license?: string | null; city?: string | null; license_verified?: boolean; drafts: number; contact_status: 'pending_contact' | 'complete'; first_login_at: string | null; email_consent_at: string | null; email_invited_at: string | null };

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
    <Button size="icon" variant="ghost" className="h-10 w-10" aria-label={`שליחת מייל ל${b.full_name || 'מתווך'}`} title="שליחת מייל" onClick={() => setOpen(true)}><Mail className="h-4 w-4" /></Button>
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
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(b.phone ? formatPhoneDisplay(b.phone) : '');
  const save = useMutation({
    mutationFn: () => invoke<{ complete: boolean }>('admin-broker-contact', { action: 'save', user_id: b.user_id, phone: phone.trim() || undefined }),
    onSuccess: d => { toast.success(d.complete ? 'הנייד נשמר · אפשר לשלוח הזמנה' : 'נשמר · עדיין נדרש נייד'); setEditing(false); void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const complete = b.contact_status === 'complete' && !!b.phone;
  const dirty = !!phone.trim() && phone.replace(/\D/g, '') !== (b.phone ? formatPhoneDisplay(b.phone).replace(/\D/g, '') : '');
  const dest = b.is_developer ? 'הפרויקטים' : 'הנכסים';
  const regLicense = b.profile_license ?? b.license_number;
  return <li className="space-y-3 rounded-xl border border-border/70 p-4">
    <div className="flex items-start gap-2">
      <button type="button" onClick={() => void openWs(b.user_id, b.is_developer)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-right hover:opacity-90" aria-label={`מעבר אל ${dest} של ${b.full_name}`}>
        {b.avatar_url && <img src={b.avatar_url} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />}
        {b.office_logo_url && <img src={b.office_logo_url} alt="" className="h-12 w-12 shrink-0 rounded-md border border-border/60 object-contain" />}
        <div className="min-w-0 space-y-1"><p className="flex items-center gap-1 text-lg font-bold">{b.full_name || 'ללא שם'}{b.license_verified && <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-label="אומת מול המאגר הממשלתי" />}</p><p className="text-base text-muted-foreground">{[b.license_number && `רישיון ${b.license_number}`, b.office_name, b.city, `${b.drafts} טיוטות`].filter(Boolean).join(' · ')}</p></div>
      </button>
      <div className="flex shrink-0 items-center gap-1 pt-1">
        {editing ? <>
          <Input autoFocus aria-label={`נייד (WhatsApp) של ${b.full_name}`} className="h-9 w-36 text-base" dir="ltr" inputMode="tel" placeholder="05X-XXXXXXX" value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && dirty) save.mutate(); if (e.key === 'Escape') setEditing(false); }} />
          <Button size="icon" variant="ghost" aria-label="שמירת נייד" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</Button>
          <Button size="icon" variant="ghost" aria-label="ביטול" onClick={() => { setPhone(b.phone ? formatPhoneDisplay(b.phone) : ''); setEditing(false); }}><X className="h-4 w-4" /></Button>
        </> : <>
          <span dir="ltr" className={`text-base ${b.phone ? '' : 'text-muted-foreground'}`}>{b.phone ? formatPhoneDisplay(b.phone) : 'אין נייד'}</span>
          <Button size="icon" variant="ghost" aria-label={`עריכת הנייד של ${b.full_name}`} disabled={!!b.first_login_at} onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /></Button>
          {complete && <OfficialBrokerInvitationDialog broker={{ id: b.user_id, full_name: b.full_name }} triggerClassName="h-10 w-10" />}
          <EmailSendDialog b={b} />
        </>}
      </div>
    </div>
    {!complete && <Badge variant="secondary" className="text-sm">ממתין להשלמת פרטי התקשרות</Badge>}
    {!b.is_developer && !b.license_verified && regLicense && <div className="flex flex-wrap items-center gap-2"><BrokerRegistryNameButton userId={b.user_id} license={regLicense} onUpdated={() => void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] })} /></div>}
  </li>;
}

type HistoryItem = { user_id: string; channel: 'whatsapp' | 'email'; status: string; sent_at: string; full_name: string; avatar_url: string | null; office_name: string | null; office_logo_url: string | null };
const STATUS: Record<string, string> = { accepted: 'נשלח', sent: 'נשלח', pending: 'בשליחה', failed: 'נכשל', delivered: 'נמסר', read: 'נקרא' };

function SendHistory() {
  const q = useQuery({ queryKey: ['broker-contact-history'], queryFn: () => invoke<{ items: HistoryItem[] }>('admin-broker-contact', { action: 'history' }) });
  const items = q.data?.items ?? [];
  return <div className="space-y-3">
    {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : q.isError ? <p role="alert" className="text-base text-destructive">{(q.error as Error).message}</p> : items.length === 0 ? <p className="text-base text-muted-foreground">עדיין לא נשלחו הודעות.</p> :
      <ul className="divide-y divide-border/70 rounded-xl border border-border/70">{items.map((i, n) => <li key={`${i.user_id}-${i.channel}-${n}`} className="flex items-center gap-3 p-3">
        {i.avatar_url ? <img src={i.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" /> : <span className="h-10 w-10 shrink-0" />}
        <div className="min-w-0 flex-1"><p className="truncate text-base font-bold">{i.full_name || 'ללא שם'}</p>{i.office_name && <p className="truncate text-sm text-muted-foreground">{i.office_name}</p>}
          <p className="text-sm text-muted-foreground">{i.channel === 'whatsapp' ? 'וואטסאפ' : 'מייל'} · {STATUS[i.status] ?? i.status} · {new Date(i.sent_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</p></div>
        {i.office_logo_url && <img src={i.office_logo_url} alt="" className="h-10 w-10 shrink-0 rounded-md border border-border/60 object-contain" />}
      </li>)}</ul>}
  </div>;
}

type ImportItem = { id: string; kind: 'developer' | 'broker'; name: string; logo_url: string | null; agency_imported: boolean; agency_name?: string | null; projects: number; source_url: string | null; imported_at: string };

function ImportHistory() {
  const q = useQuery({ queryKey: ['broker-import-history'], queryFn: () => invoke<{ items: ImportItem[] }>('admin-broker-contact', { action: 'imports' }) });
  const items = q.data?.items ?? [];
  if (q.isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (q.isError) return <p role="alert" className="text-base text-destructive">{(q.error as Error).message}</p>;
  if (!items.length) return <p className="text-base text-muted-foreground">עדיין לא בוצעו יבואים.</p>;
  return <div className="overflow-x-auto rounded-xl border border-border/70">
    <table className="w-full min-w-[520px] text-right text-sm">
      <thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-2 font-semibold">שם</th><th className="p-2 font-semibold">סוג</th><th className="p-2 font-semibold">לוגו</th><th className="p-2 font-semibold">פרטי משרד</th><th className="p-2 font-semibold">{'פרויקטים/נכסים'}</th><th className="p-2 font-semibold">תאריך</th><th className="p-2 font-semibold">מקור</th></tr></thead>
      <tbody className="divide-y divide-border/70">{items.map(i => <tr key={`${i.kind}-${i.id}`}>
        <td className="p-2"><div className="flex items-center gap-2">{i.logo_url ? <img src={i.logo_url} alt="" className="h-8 w-8 shrink-0 rounded-md border border-border/60 object-contain" /> : <span className="h-8 w-8 shrink-0" />}<span className="font-bold">{i.name || 'ללא שם'}</span></div></td>
        <td className="p-2">{i.kind === 'developer' ? 'יזם' : 'מתווך'}</td>
        <td className="p-2">{i.logo_url ? <Check className="h-4 w-4 text-primary" aria-label="יובא" /> : <X className="h-4 w-4 text-muted-foreground" aria-label="חסר" />}</td>
        <td className="p-2">{i.agency_imported ? <Check className="h-4 w-4 text-primary" aria-label="יובא" /> : <X className="h-4 w-4 text-muted-foreground" aria-label="חסר" />}</td>
        <td className="p-2">{i.projects}</td>
        <td className="p-2 whitespace-nowrap">{new Date(i.imported_at).toLocaleDateString('he-IL')}</td>
        <td className="p-2">{i.source_url ? <a href={i.source_url} target="_blank" rel="noopener noreferrer" aria-label="פתיחת עמוד המקור ביד 2" className="inline-flex text-primary"><ExternalLink className="h-4 w-4" /></a> : <span className="text-muted-foreground">-</span>}</td>
      </tr>)}</tbody>
    </table>
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
    <Tabs defaultValue="sends" dir="rtl" className="pt-2">
      <TabsList><TabsTrigger value="sends">היסטוריית שליחות</TabsTrigger><TabsTrigger value="imports">היסטוריית יבוא</TabsTrigger></TabsList>
      <TabsContent value="sends"><SendHistory /></TabsContent>
      <TabsContent value="imports"><ImportHistory /></TabsContent>
    </Tabs>
  </section>;
}
