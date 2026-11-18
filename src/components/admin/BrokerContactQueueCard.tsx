import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Save, Loader2, Mail, UserRoundSearch, Check, X, Trash2, ShieldCheck } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BrokerRegistryNameButton } from './BrokerRegistryNameButton';
import { MarketingContactLine, type MarketingContact } from './MarketingContactLine';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { OfficialBrokerInvitationPanel } from './OfficialBrokerInvitationDialog';
import { BrokerInvitationTemplateEditor } from './BrokerInvitationTemplateEditor';
import { BrokerEmailConsentButton } from './BrokerEmailInvitations';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useWorkspace } from '@/hooks/useWorkspace';
import { returnState } from '@/lib/returnNav';
import yad2Symbol from '@/assets/yad2-source-symbol.png.asset.json';

export type ContactBroker = { user_id: string; full_name: string; phone: string | null; email: string | null; license_number: string | null; office_name: string | null; office_logo_url?: string | null; avatar_url?: string | null; is_developer?: boolean; profile_license?: string | null; city?: string | null; license_verified?: boolean; drafts: number; projects?: number; apartments?: number; contact_status: 'pending_contact' | 'complete'; first_login_at: string | null; email_consent_at: string | null; email_invited_at: string | null };

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) { const d = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null; throw new Error(typeof d?.error === 'string' ? d.error : 'הפעולה נכשלה'); }
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

const DEFAULT_EMAIL = (name: string) => `שלום${name ? ` ${name.split(/\s+/)[0]}` : ''},

חסכנו לך את העבודה והזנו עבורך את פרטי הנכסים. הם שמורים במרחב האישי שלך ב-TORAFF וממתינים לבדיקה שלך.

הנכסים לא יתפרסמו בלי אישורך. אחרי כניסה עם קוד אימות אפשר לעבור עליהם, לתקן פרטים ולקבוע עמלת סגירה ותמחור פניות.`;

function EmailSendDialog({ b, contactPhone }: { b: ContactBroker; contactPhone?: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<'email' | 'whatsapp'>('email');
  const waSent = useRef(false);
  const [email, setEmail] = useState(b.email ?? '');
  const [body, setBody] = useState(() => DEFAULT_EMAIL(b.full_name));
  const bodyTouched = useRef(false);
  const [demo, setDemo] = useState(false);
  // Same gender-matched default wording as the WhatsApp template, filled with the recipient's first name.
  const sharedText = useQuery({ queryKey: ['broker-template-texts', 'recipient', b.user_id], enabled: open, queryFn: () => invoke<{ recipient?: string }>('admin-broker-invitation', { action: 'texts', broker_id: b.user_id }) });
  useEffect(() => {
    const t = sharedText.data?.recipient;
    if (!t || bodyTouched.current) return;
    setBody(t.replace('{brokerName}', b.full_name.split(/\s+/)[0] || '').replace(/\s*\{authLink\}\s*/, '\n').trim());
  }, [sharedText.data, b.full_name]);
  const saveEmail = useMutation({
    mutationFn: () => invoke('admin-broker-contact', { action: 'save', user_id: b.user_id, email: email.trim() }),
    onSuccess: () => { toast.success('האימייל נשמר'); void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const send = useMutation({
    mutationFn: () => invoke<{ sent: number }>('admin-broker-email-invitation', { action: 'send_batch', broker_id: b.user_id, limit: 1, message: body.trim(), demo }),
    onSuccess: d => { if (d.sent) { toast.success('המייל נשלח'); setOpen(false); } else toast.error('המייל לא נשלח'); void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); void qc.invalidateQueries({ queryKey: ['broker-contact-history'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const emailDirty = email.trim().toLowerCase() !== (b.email ?? '');
  // The button stays clickable; missing details are explained instead of silently disabling it.
  const trySend = async () => {
    if (!email.trim()) { toast.error('יש להזין כתובת אימייל'); return; }
    if (emailDirty) { try { await saveEmail.mutateAsync(); } catch { return; } }
    if (!b.email_consent_at) { toast.error('יש לתעד הסכמה לקבלת מייל לפני השליחה'); return; }
    if (body.trim().length < 10) { toast.error('נוסח המייל קצר מדי'); return; }
    send.mutate();
  };
  return <>
    <Button size="icon" variant="ghost" className="h-7 w-7 sm:h-8 sm:w-8" aria-label={`שליחת הזמנה ל${b.full_name || 'מתווך'}`} title="שליחת הזמנה" onClick={() => { setOpen(true); setChannel('email'); }}><Mail className="h-4 w-4" /></Button>
    <Dialog open={open} onOpenChange={v => { if (!send.isPending) { setOpen(v); if (!v && waSent.current) { waSent.current = false; void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); } } }}>
      <DialogContent dir="rtl" className="w-[calc(100%-2rem)] max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto text-right">
        <DialogHeader><DialogTitle>שליחת הזמנה ל{b.full_name || 'מתווך'}</DialogTitle><DialogDescription className="sr-only">בחירת ערוץ שליחה</DialogDescription></DialogHeader>
        <Tabs value={channel} onValueChange={v => setChannel(v as 'email' | 'whatsapp')} dir="rtl">
        <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="email">אימייל</TabsTrigger><TabsTrigger value="whatsapp">WhatsApp</TabsTrigger></TabsList>
        <TabsContent value="whatsapp"><div className="flex justify-end"><BrokerInvitationTemplateEditor /></div>{contactPhone && <p className="pt-2 text-sm text-muted-foreground">ההזמנה וקוד הכניסה יישלחו לאיש הקשר בחברת השיווק: <span dir="ltr">{formatPhoneDisplay(contactPhone)}</span></p>}{b.phone || contactPhone ? <OfficialBrokerInvitationPanel broker={{ id: b.user_id, full_name: b.full_name }} onClose={() => setOpen(false)} onSent={() => { waSent.current = true; }} /> : <p className="py-4 text-base text-muted-foreground">יש להוסיף נייד בכרטיס כדי לשלוח ב-WhatsApp.</p>}</TabsContent>
        <TabsContent value="email" className="space-y-3">
        <div className="flex gap-2">
          <Input aria-label="כתובת אימייל" className="h-11 text-base" dir="ltr" type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          <Button variant="outline" className="h-11" disabled={!email.trim() || !emailDirty || saveEmail.isPending} onClick={() => saveEmail.mutate()}>{saveEmail.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}שמירה</Button>
        </div>
        {b.email && !b.email_consent_at && <div className="flex items-center gap-2 text-sm text-muted-foreground">נדרשת הסכמה מתועדת לפני שליחה:<BrokerEmailConsentButton broker={{ id: b.user_id, full_name: b.full_name, email: b.email }} state={{ email_consent_at: b.email_consent_at, email_unsubscribed_at: null, email_invited_at: b.email_invited_at }} /></div>}
        <Textarea aria-label="נוסח המייל" className="min-h-[200px] text-base" value={body} onChange={e => { bodyTouched.current = true; setBody(e.target.value); }} />
        <p className="text-sm text-muted-foreground">קישור הכניסה לנכסים וקישור ההסרה מתווספים אוטומטית בסוף המייל.</p>
        <label className="flex items-center gap-2 text-base"><input type="checkbox" className="h-4 w-4" checked={demo} onChange={e => setDemo(e.target.checked)} />שלח כחשבון דמו לצפייה בלבד</label>
        {demo && <p className="text-sm text-muted-foreground">יישלחו פרטי חשבון הדמו (0501234567, קוד 1234) במקום כניסה אישית. בחשבון הדמו אין אפשרות לפרסם.</p>}
        {b.email_invited_at && !demo && <p className="text-sm text-muted-foreground">הזמנה כבר נשלחה באימייל למתווך זה.</p>}
        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <Button variant="outline" disabled={send.isPending} onClick={() => setOpen(false)}>ביטול</Button>
          <Button disabled={send.isPending} onClick={() => void trySend()}>{send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}שליחה</Button>
        </DialogFooter>
        </TabsContent></Tabs>
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

function BrokerRow({ b, marketing }: { b: ContactBroker; marketing?: MarketingContact | null }) {
  const qc = useQueryClient();
  const openWs = useOpenWorkspace();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [phone, setPhone] = useState(b.phone ? formatPhoneDisplay(b.phone) : '');
  const save = useMutation({
    mutationFn: () => invoke<{ complete: boolean }>('admin-broker-contact', { action: 'save', user_id: b.user_id, phone: phone.trim() || undefined }),
    onSuccess: d => {
      toast.success(d.complete ? 'הנייד נשמר · אפשר לשלוח הזמנה' : 'נשמר · עדיין נדרש נייד'); setEditing(false); void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] });
      // Pull the WhatsApp profile photo for the new number right away (never overwrites an existing photo).
      void supabase.functions.invoke('sync-owner-wa-avatar', { body: { owner_id: b.user_id } }).then(({ data }) => { if (data?.updated) { toast.success('תמונת הפרופיל יובאה מ-WhatsApp'); void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); } });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async () => {
      const data = await invoke<{ results?: { user_id: string; status: string }[] }>('super-admin-delete-users', { user_ids: [b.user_id] });
      if (data.results?.find(result => result.user_id === b.user_id)?.status !== 'deleted') throw new Error('המחיקה לא הושלמה. רעננו ונסו שוב.');
    },
    onSuccess: () => {
      setDeleting(false);
      toast.success('החשבון נמחק לצמיתות');
      void Promise.all(['broker-contact-queue', 'broker-contact-history', 'broker-import-history', 'import-invitation-followups', 'workspaces'].map(queryKey => qc.invalidateQueries({ queryKey: [queryKey] })));
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const dirty = !!phone.trim() && phone.replace(/\D/g, '') !== (b.phone ? formatPhoneDisplay(b.phone).replace(/\D/g, '') : '');
  const dest = b.is_developer ? 'הפרויקטים' : 'הנכסים';
  const regLicense = b.profile_license ?? b.license_number;
  const details = [...(b.is_developer ? [`${b.projects ?? 0} פרויקטים`, `${b.apartments ?? 0} דירות`] : []), ...(!b.is_developer || b.drafts > 0 ? [`${b.drafts} טיוטות`] : []), b.license_number && `רישיון ${b.license_number}`, b.office_name, b.city].filter(Boolean).join(' · ');
  return <li className="relative space-y-2 rounded-xl border border-border/70 p-3 pl-12 sm:p-4 sm:pl-12">
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => void openWs(b.user_id, b.is_developer)} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-right hover:opacity-90" aria-label={`מעבר אל ${dest} של ${b.full_name}`}>
        {b.office_logo_url ? <img src={b.office_logo_url} alt="" className="h-9 w-9 shrink-0 rounded-md border border-border/60 object-contain" /> : b.avatar_url ? <img src={b.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : null}
        <span className="flex min-w-0 items-center gap-1 text-base font-bold sm:text-lg"><span className="truncate">{b.full_name || 'ללא שם'}</span>{b.license_verified && <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-label="אומת מול המאגר הממשלתי" />}</span>
      </button>
      <div className="flex shrink-0 items-center gap-0">
        {editing ? <>
          <Input autoFocus aria-label={`נייד (WhatsApp) של ${b.full_name}`} className="h-8 w-24 px-2 text-sm sm:w-36 sm:text-base" dir="ltr" inputMode="tel" placeholder="05X-XXXXXXX" value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && dirty) save.mutate(); if (e.key === 'Escape') setEditing(false); }} />
          <Button size="icon" variant="ghost" className="h-7 w-7 sm:h-8 sm:w-8" aria-label="שמירת נייד" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 sm:h-8 sm:w-8" aria-label="ביטול" onClick={() => { setPhone(b.phone ? formatPhoneDisplay(b.phone) : ''); setEditing(false); }}><X className="h-4 w-4" /></Button>
        </> : <>
          <button type="button" dir={b.phone ? 'ltr' : 'rtl'} disabled={!!b.first_login_at} title="נייד היזם" aria-label={b.phone ? `עריכת הנייד של ${b.full_name}` : `הוספת נייד ל${b.full_name}`} onClick={() => setEditing(true)} className={`whitespace-nowrap px-1 text-xs underline decoration-dotted underline-offset-4 disabled:no-underline sm:text-base ${b.phone ? '' : 'text-primary'}`}>{b.phone ? formatPhoneDisplay(b.phone) : 'הוסף נייד'}</button>
          <EmailSendDialog b={b} contactPhone={marketing?.contact_phone} />
        </>}
        <Button size="icon" variant="ghost" className="absolute left-[10px] top-[10px] h-7 w-7 text-destructive sm:h-8 sm:w-8" aria-label={`מחיקת החשבון של ${b.full_name || 'ללא שם'}`} title="מחיקת החשבון" disabled={remove.isPending} onClick={() => setDeleting(true)}><X className="h-4 w-4" /></Button>
      </div>
    </div>
    <div className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap">
      <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground sm:text-base" title={details}>{details}</p>
      {!b.is_developer && !b.license_verified && regLicense && <BrokerRegistryNameButton compact userId={b.user_id} license={regLicense} onUpdated={() => void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] })} />}
    </div>
    {b.is_developer && <MarketingContactLine ownerId={b.user_id} devName={b.full_name} contact={marketing} />}
    <Dialog open={deleting} onOpenChange={open => { if (!remove.isPending) setDeleting(open); }}>
      <DialogContent dir="rtl" className="w-[calc(100%-2rem)] max-w-md text-right">
        <DialogHeader><DialogTitle>מחיקת החשבון של {b.full_name || 'ללא שם'}</DialogTitle></DialogHeader>
        <DialogDescription>החשבון, {b.is_developer ? 'הפרויקטים' : 'הנכסים'} והנתונים המשויכים יימחקו לצמיתות. לא ניתן לשחזר את הפעולה.</DialogDescription>
        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between"><Button variant="outline" disabled={remove.isPending} onClick={() => setDeleting(false)}>ביטול</Button><Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}מחיקה לצמיתות</Button></DialogFooter>
      </DialogContent>
    </Dialog>
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

type ImportItem = { id: string; kind: 'developer' | 'broker'; name: string; logo_url: string | null; avatar_url?: string | null; workspace_owner_id?: string | null; public_user_id?: string | null; agency_imported: boolean; agency_name?: string | null; projects: number; source_url: string | null; imported_at: string; status?: string; error?: string | null };

export function ImportHistory() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { activeWorkspaceId, setActiveWorkspace } = useWorkspace();
  const [deleting, setDeleting] = useState<ImportItem | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: (item: ImportItem) => invoke('admin-broker-contact', { action: 'delete_import', record_id: item.id }),
    onSuccess: () => { setDeleting(null); toast.success('הרשומה נמחקה מהיסטוריית היבוא'); void qc.invalidateQueries({ queryKey: ['broker-import-history'] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  const openInventory = async (item: ImportItem) => {
    if (!item.workspace_owner_id) return;
    const origin = { ...returnState(), importHistoryReturn: true, previousWorkspaceId: activeWorkspaceId };
    setOpening(item.id);
    try { await setActiveWorkspace(item.workspace_owner_id); navigate(item.kind === 'developer' ? '/developer-dashboard' : '/properties', { state: origin }); }
    catch { /* workspace provider shows authorization errors */ }
    finally { setOpening(null); }
  };
  const q = useQuery({ queryKey: ['broker-import-history'], queryFn: () => invoke<{ items: ImportItem[] }>('admin-broker-contact', { action: 'imports' }) });
  const items = q.data?.items ?? [];
  if (q.isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (q.isError) return <p role="alert" className="text-base text-destructive">{(q.error as Error).message}</p>;
  if (!items.length) return <p className="text-base text-muted-foreground">עדיין לא בוצעו יבואים.</p>;
  return <div className="overflow-x-auto rounded-xl border border-border/70">
    <table className="w-full min-w-[520px] text-right text-sm">
      <thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-2 font-semibold">לוגו</th><th className="p-2 font-semibold">שם</th><th className="p-2 font-semibold">סוג</th><th className="p-2 font-semibold">{'פרויקטים/נכסים'}</th><th className="p-2 font-semibold">סטטוס</th><th className="p-2 font-semibold">תאריך</th><th className="p-2 font-semibold">מקור</th><th className="p-2"><span className="sr-only">מחיקת רשומה</span></th></tr></thead>
      <tbody className="divide-y divide-border/70">{items.map(i => <tr key={`${i.kind}-${i.id}`}>
        <td className="p-2">{i.logo_url ? <img src={i.logo_url} alt="לוגו שיובא" className="h-8 w-8 rounded-md object-contain" /> : <X className="h-4 w-4 text-muted-foreground" aria-label="חסר" />}</td>
        <td className="p-2"><Button variant="ghost" className="h-auto justify-start gap-2 p-0 text-right font-bold whitespace-normal" disabled={!i.workspace_owner_id || opening !== null} aria-label={`פתיחת ${i.kind === 'developer' ? 'הפרויקטים' : 'הנכסים'} של ${i.name}`} onClick={() => void openInventory(i)}>{i.avatar_url && <img src={i.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />}<span>{i.name || 'ללא שם'}</span>{opening === i.id && <Loader2 className="h-4 w-4 animate-spin" />}</Button></td>
        <td className="p-2">{i.kind === 'developer' ? 'יזם' : 'מתווך'}</td>
        <td className="p-2">{i.projects}</td>
        <td className="p-2 whitespace-nowrap" title={i.error ?? undefined}>{i.status === 'failed' ? <span className="text-destructive">נכשל</span> : i.status === 'completed' || !i.status ? 'הושלם' : 'בתהליך'}</td>
        <td className="p-2 whitespace-nowrap">{new Date(i.imported_at).toLocaleDateString('he-IL')}</td>
        <td className="p-2">{i.source_url ? <Button asChild variant="ghost" size="icon" title="פתיחת עמוד המקור ביד 2"><a href={i.source_url} target="_blank" rel="noopener noreferrer" aria-label="פתיחת עמוד המקור ביד 2"><img src={yad2Symbol.url} alt="" className="h-6 w-6 object-contain" /></a></Button> : <span className="text-muted-foreground">-</span>}</td>
        <td className="p-2"><Button variant="ghost" size="icon" className="text-destructive" title="מחיקת רשומה מההיסטוריה" aria-label={`מחיקת רשומת היבוא של ${i.name}`} onClick={() => setDeleting(i)}><Trash2 className="h-4 w-4" /></Button></td>
      </tr>)}</tbody>
    </table>
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !remove.isPending) setDeleting(null); }}><DialogContent dir="rtl"><DialogHeader><DialogTitle>מחיקת רשומה מההיסטוריה</DialogTitle></DialogHeader><p>למחוק את רשומת היבוא של {deleting?.name}? החשבון, הפרויקטים והנכסים יישארו ללא שינוי.</p><DialogFooter className="flex-row justify-between sm:justify-between"><Button variant="outline" disabled={remove.isPending} onClick={() => setDeleting(null)}>ביטול</Button><Button variant="destructive" disabled={remove.isPending} onClick={() => { if (deleting) remove.mutate(deleting); }}>{remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}מחיקה</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function FollowupQueue() {
  const q = useQuery({ queryKey: ['import-invitation-followups'], queryFn: () => invoke<{ items: { user_id: string; full_name: string; channel: string; message: string; due_at: string }[] }>('admin-broker-contact', { action: 'followups' }) });
  if (q.isError) return <p role="alert" className="text-destructive">{(q.error as Error).message}</p>;
  if (!q.data?.items.length) return null;
  return <section className="space-y-3"><h4 className="text-lg font-bold">תזכורות לאחר 48 שעות</h4><ul className="divide-y divide-border">{q.data.items.map(item => <li key={item.user_id} className="space-y-2 py-3"><p className="font-semibold">{item.full_name} · {item.channel === 'email' ? 'מייל' : 'WhatsApp'} · ממתין לשליחה</p><p className="text-base leading-relaxed">{item.message}</p></li>)}</ul></section>;
}

/** Silently imported accounts awaiting their first successful invitation. */
export function BrokerContactQueueCard() {
  const [params, setParams] = useSearchParams();
  const q = useQuery({ queryKey: ['broker-contact-queue'], queryFn: () => invoke<{ brokers: ContactBroker[] }>('admin-broker-contact', { action: 'list' }), refetchOnWindowFocus: true, refetchInterval: 30000 });
  const brokers = q.data?.brokers ?? [];
  const pending = brokers.length;
  const devIds = brokers.filter(b => b.is_developer).map(b => b.user_id);
  const marketing = useQuery({ queryKey: ['marketing-contacts', devIds.join(',')], enabled: devIds.length > 0, queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_marketing_contacts', { _owners: devIds });
    if (error) throw error; return new Map((data ?? []).map(r => [r.owner_id, r as MarketingContact]));
  } });
  return <section dir="rtl" className="space-y-4 py-5 text-right">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-xl font-bold"><UserRoundSearch className="h-5 w-5 text-primary" />ממתינים להזמנה ראשונה</h3>{pending > 0 && <Badge variant="secondary" className="text-sm">{pending} ממתינים</Badge>}</div>
    {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : q.isError ? <p role="alert" className="text-base text-destructive">{(q.error as Error).message}</p> : brokers.length === 0 ? <p className="text-base text-muted-foreground">אין חשבונות שממתינים להזמנה ראשונה.</p> :
      <ul className="space-y-3">{brokers.map(b => <BrokerRow key={b.user_id} b={b} marketing={marketing.data?.get(b.user_id)} />)}</ul>}
    <FollowupQueue />
    <Tabs value={params.get('history') === 'sends' ? 'sends' : 'imports'} onValueChange={value => setParams(current => { const next = new URLSearchParams(current); next.set('history', value); return next; }, { replace: true })} dir="rtl" className="pt-2">
      <TabsList><TabsTrigger value="imports">היסטוריית יבוא</TabsTrigger><TabsTrigger value="sends">היסטוריית שליחות</TabsTrigger></TabsList>
      <TabsContent value="sends"><SendHistory /></TabsContent>
      <TabsContent value="imports"><ImportHistory /></TabsContent>
    </Tabs>
  </section>;
}
