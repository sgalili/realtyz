import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Save, Loader2, Mail, UserRoundSearch, Check, X, Trash2, ShieldCheck, ChevronDown, Phone } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BrokerRegistryNameButton } from './BrokerRegistryNameButton';
import { MarketingContactLine, type MarketingContact } from './MarketingContactLine';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { OfficialBrokerInvitationPanel } from './OfficialBrokerInvitationDialog';
import { BrokerInvitationTemplateEditor } from './BrokerInvitationTemplateEditor';
import { InvitationAttachmentPicker } from './InvitationAttachmentPicker';
import { recipientGroup, type RecipientGroup } from '@/lib/invitationSummaries';
import { BrokerEmailConsentButton } from './BrokerEmailInvitations';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useWorkspace } from '@/hooks/useWorkspace';
import { returnState } from '@/lib/returnNav';
import { invitationHistoryKey, threadInvitationHistory } from '@/lib/invitationHistory';
import { readSuperAdminViewState, saveSuperAdminViewState } from '@/lib/superAdminViewState';
import { DeveloperLogo } from '@/components/developers/DeveloperLogo';

export type ContactBroker = { user_id: string; full_name: string; phone: string | null; email: string | null; license_number: string | null; office_name: string | null; office_logo_url?: string | null; avatar_url?: string | null; is_developer?: boolean; profile_license?: string | null; city?: string | null; license_verified?: boolean; gender?: string | null; drafts: number; projects?: number; apartments?: number; contact_status: 'pending_contact' | 'complete'; first_login_at: string | null; email_consent_at: string | null; email_invited_at: string | null };

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) { const d = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null; throw new Error(typeof d?.error === 'string' ? d.error : 'הפעולה נכשלה'); }
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

const DEFAULT_SUBJECT = 'הזמנה לפרסום חינם בלוח נדל"ן מבוסס שותפים ובינה מלאכותית';
const DEFAULT_EMAIL = (name: string) => `שלום${name ? ` ${name.split(/\s+/)[0]}` : ''},

חסכנו לך את העבודה והזנו עבורך את פרטי הנכסים. הם שמורים במרחב האישי שלך ב-TORAFF וממתינים לבדיקה שלך.

הנכסים לא יתפרסמו בלי אישורך. לאחר הכניסה אפשר לעבור עליהם, לתקן פרטים ולקבוע עמלת סגירה ותמחור פניות.`;

function EmailSendDialog({ b, contactPhone, contactName }: { b: ContactBroker; contactPhone?: string | null; contactName?: string | null }) {
  // Greeting and title use the actual recipient: the saved contact person when set, otherwise the account holder.
  const recipientName = (contactName?.trim() || b.full_name || '').trim();
  const recipientFirst = recipientName.split(/\s+/)[0] || '';
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<'email' | 'whatsapp'>('email');
  const waSent = useRef(false);
  const [email, setEmail] = useState(b.email ?? '');
  const [body, setBody] = useState(() => DEFAULT_EMAIL(recipientFirst));
  const bodyTouched = useRef(false);
  const [demo, setDemo] = useState(true);
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [attachmentId, setAttachmentId] = useState<string | null>(null);
  // Same gender-matched default wording as the WhatsApp template, filled with the recipient's first name.
  const sharedText = useQuery({ queryKey: ['broker-template-texts', 'recipient', b.user_id], enabled: open, queryFn: () => invoke<{ recipient?: string }>('admin-broker-invitation', { action: 'texts', broker_id: b.user_id }) });
  useEffect(() => {
    const t = sharedText.data?.recipient;
    if (!t || bodyTouched.current) return;
    setBody(t.replace(/\{brokerName\}|\[שם פרטי\]/g, recipientFirst).replace(/\s*\{authLink\}\s*/, '\n').trim());
  }, [sharedText.data, recipientFirst]);
  const saveEmail = useMutation({
    mutationFn: () => invoke('admin-broker-contact', { action: 'save', user_id: b.user_id, email: email.trim() }),
    onSuccess: () => { toast.success('האימייל נשמר'); void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const send = useMutation({
    mutationFn: () => invoke<{ sent: number; results?: { status: string; error?: string }[] }>('admin-broker-email-invitation', { action: 'send_batch', broker_id: b.user_id, limit: 1, message: body.trim(), demo, subject: subject.trim() || DEFAULT_SUBJECT, attachment_id: attachmentId }),
    onSuccess: d => { if (d.sent) { toast.success('המייל נשלח'); setOpen(false); } else { const r = d.results?.[0]; toast.error(r?.status === 'skipped' ? 'המייל לא נשלח: כבר נשלחה הזמנה או שהחשבון כבר נכנס' : `המייל לא נשלח${r?.error ? `: ${r.error}` : ''}`); } void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); void qc.invalidateQueries({ queryKey: ['broker-contact-history'] }); },
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
        <DialogHeader><DialogTitle>שליחת הזמנה ל{recipientName || 'מתווך'}</DialogTitle><DialogDescription className="sr-only">בחירת ערוץ שליחה</DialogDescription></DialogHeader>
        <Tabs value={channel} onValueChange={v => setChannel(v as 'email' | 'whatsapp')} dir="rtl">
        <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="email">אימייל</TabsTrigger><TabsTrigger value="whatsapp">WhatsApp</TabsTrigger></TabsList>
        <div className="mt-3"><InvitationAttachmentPicker value={attachmentId} onChange={setAttachmentId} recipientRole={contactPhone ? 'marketing_company' : b.is_developer ? 'developer' : 'broker'} /></div>
        <TabsContent value="whatsapp" className="space-y-3"><div className="flex justify-end"><BrokerInvitationTemplateEditor /></div>{contactPhone && <p className="pt-2 text-sm text-muted-foreground">ההזמנה וקוד הכניסה יישלחו לאיש הקשר בחברת השיווק: <span dir="ltr">{formatPhoneDisplay(contactPhone)}</span></p>}{b.phone || contactPhone ? <OfficialBrokerInvitationPanel broker={{ id: b.user_id, full_name: b.full_name, recipient_name: contactPhone ? contactName : null }} onClose={() => setOpen(false)} onSent={() => { waSent.current = true; }} attachmentId={attachmentId} /> : <p className="py-4 text-base text-muted-foreground">יש להוסיף נייד בכרטיס כדי לשלוח ב-WhatsApp.</p>}</TabsContent>
        <TabsContent value="email" className="space-y-3">
        <div className="flex gap-2">
          <Input aria-label="כתובת אימייל" className="h-11 text-base" dir="ltr" type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          <Button variant="outline" className="h-11" disabled={!email.trim() || !emailDirty || saveEmail.isPending} onClick={() => saveEmail.mutate()}>{saveEmail.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}שמירה</Button>
        </div>
        {b.email && !b.email_consent_at && <div className="flex items-center gap-2 text-sm text-muted-foreground">נדרשת הסכמה מתועדת לפני שליחה:<BrokerEmailConsentButton broker={{ id: b.user_id, full_name: b.full_name, email: b.email }} state={{ email_consent_at: b.email_consent_at, email_unsubscribed_at: null, email_invited_at: b.email_invited_at }} /></div>}
        <label className="block space-y-1"><span className="text-sm font-medium">כותרת המייל</span><Input aria-label="כותרת המייל" className="h-11 text-base" maxLength={200} value={subject} onChange={e => setSubject(e.target.value)} /></label>
        <Textarea aria-label="נוסח המייל" className="min-h-[200px] text-base" value={body} onChange={e => { bodyTouched.current = true; setBody(e.target.value); }} />
        <p className="text-sm text-muted-foreground">{demo ? 'קישור הדמו וקישור ההסרה מתווספים אוטומטית בסוף המייל.' : 'קישור הכניסה לנכסים וקישור ההסרה מתווספים אוטומטית בסוף המייל.'}</p>
        <label className="flex items-center gap-2 text-base"><input type="checkbox" className="h-4 w-4" checked={demo} onChange={e => setDemo(e.target.checked)} />שלח קישור לחשבון דמו לצפייה בלבד</label>
        {demo && <p className="text-sm text-muted-foreground">הקישור יותאם אוטומטית לסוג המשתמש, ללא הרשמה או קוד אימות. אם הסוג אינו ידוע, הנמען יבחר אותו לפני הכניסה לדמו.</p>}
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
    const origin = returnState();
    try { await setActiveWorkspace(id); navigate(developer ? '/developer-dashboard' : '/properties', developer ? { state: origin } : undefined); } catch { /* toast shown by switcher */ }
  };
}

/** Brokerage office name (bold, click-to-edit with dotted underline) with its logo when one exists. */
function OfficeNameField({ b }: { b: ContactBroker }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(b.office_name ?? '');
  const save = useMutation({
    mutationFn: () => invoke('admin-broker-contact', { action: 'save', user_id: b.user_id, office_name: value.trim() }),
    onSuccess: () => { toast.success('שם המשרד נשמר'); setEditing(false); void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const commit = () => { if (value.trim().length < 2) { toast.error('שם המשרד קצר מדי'); return; } save.mutate(); };
  if (editing) return <span className="flex shrink-0 items-center gap-1">
    <Input autoFocus aria-label="שם משרד התיווך" className="h-8 w-40 px-2 text-sm sm:text-base" value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }} />
    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="שמירת שם המשרד" disabled={save.isPending} onClick={commit}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</Button>
    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="ביטול" onClick={() => { setValue(b.office_name ?? ''); setEditing(false); }}><X className="h-4 w-4" /></Button>
  </span>;
  return <span className="flex min-w-0 shrink items-center gap-1.5">
    {b.is_developer ? <DeveloperLogo name={b.office_name} logoUrl={b.office_logo_url} className="h-7 w-7" /> : b.office_logo_url && <img src={b.office_logo_url} alt="" className="h-7 w-7 shrink-0 rounded-md object-contain" />}
    <button type="button" disabled={!!b.first_login_at} onClick={() => setEditing(true)} aria-label="עריכת שם משרד התיווך" className={`min-w-0 truncate text-sm font-bold underline decoration-dotted underline-offset-4 disabled:no-underline sm:text-base ${b.office_name ? 'text-foreground' : 'text-primary'}`}>{b.office_name || 'הוסף משרד תיווך'}</button>
    <span aria-hidden className="text-muted-foreground">·</span>
  </span>;
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
  const setGender = useMutation({
    mutationFn: (gender: 'male' | 'female') => invoke('admin-broker-contact', { action: 'save', user_id: b.user_id, gender }),
    onSuccess: () => { toast.success('המגדר נשמר'); void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const details = b.is_developer ? `${b.projects ?? 0} פרויקטים • ${b.apartments ?? 0} דירות במאגר` : [`${b.drafts} טיוטות`, b.license_number && `רישיון ${b.license_number}`, b.city].filter(Boolean).join(' · ');
  const phoneControls = editing ? <>
          <Input autoFocus aria-label={`נייד (WhatsApp) של ${b.full_name}`} className="h-8 w-24 px-2 text-sm sm:w-36 sm:text-base" dir="ltr" inputMode="tel" placeholder="05X-XXXXXXX" value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && dirty) save.mutate(); if (e.key === 'Escape') setEditing(false); }} />
          <Button size="icon" variant="ghost" className="h-7 w-7 sm:h-8 sm:w-8" aria-label="שמירת נייד" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 sm:h-8 sm:w-8" aria-label="ביטול" onClick={() => { setPhone(b.phone ? formatPhoneDisplay(b.phone) : ''); setEditing(false); }}><X className="h-4 w-4" /></Button>
        </> : <>
          <button type="button" dir={b.phone ? 'ltr' : 'rtl'} disabled={!!b.first_login_at} title="נייד" aria-label={b.phone ? `עריכת הנייד של ${b.full_name}` : `הוספת נייד ל${b.full_name}`} onClick={() => setEditing(true)} className={`whitespace-nowrap px-1 text-xs underline decoration-dotted underline-offset-4 disabled:no-underline sm:text-base ${b.phone ? '' : 'text-primary'}`}>{b.phone ? formatPhoneDisplay(b.phone) : 'הוסף טלפון'}</button>
          {b.phone && <a href={`tel:+${b.phone}`} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-primary hover:bg-accent" aria-label={`חיוג אל ${b.full_name} ${formatPhoneDisplay(b.phone)}`} title={formatPhoneDisplay(b.phone)}><Phone className="h-4 w-4" /></a>}
        </>;
  return <li className="space-y-2 rounded-xl border border-border/70 p-3 sm:p-4">
    <div className="flex items-center gap-1">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {b.license_verified && <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-label="אומת מול המאגר הממשלתי" />}
        <button type="button" onClick={() => void openWs(b.user_id, b.is_developer)} className="flex min-w-0 items-center gap-2 rounded-lg text-right hover:opacity-90" aria-label={`מעבר אל ${dest} של ${b.full_name}`}>
          {b.is_developer ? <DeveloperLogo name={b.full_name} logoUrl={b.office_logo_url} className="h-9 w-9" /> : b.avatar_url ? <img src={b.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : null}
          <span className="truncate text-base font-bold sm:text-lg">{b.full_name || 'ללא שם'}</span>
        </button>
        {!b.is_developer && !b.gender && <div role="radiogroup" aria-label="מגדר המתווך" className="flex shrink-0">{([['male', 'זכר', '\u2642\uFE0E'], ['female', 'נקבה', '\u2640\uFE0E']] as const).map(([g, label, icon]) => <Button key={g} type="button" size="icon" variant="ghost" role="radio" aria-checked={false} aria-label={label} title={label} className="h-7 w-7 text-base text-muted-foreground" disabled={setGender.isPending} onClick={() => setGender.mutate(g)}>{icon}</Button>)}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-0">
        {phoneControls}
        <EmailSendDialog b={b} contactPhone={marketing?.contact_phone} contactName={marketing?.contact_name} />
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive sm:h-8 sm:w-8" aria-label={`מחיקת החשבון של ${b.full_name || 'ללא שם'}`} title="מחיקת החשבון" disabled={remove.isPending} onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
    <div className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap">
      {!b.is_developer && <OfficeNameField b={b} />}
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

type HistoryItem = { user_id: string; recipient_kind?: string | null; phone?: string | null; developer_logo_url?: string | null; channel: 'whatsapp' | 'email'; status: string; sent_at: string; full_name: string; avatar_url: string | null; office_name: string | null; office_logo_url: string | null; content?: { to?: string; subject?: string; body?: string; links?: { label: string; url: string }[]; demo?: boolean; error?: string | null; template?: string } };
const STATUS: Record<string, string> = { accepted: 'נשלח', sent: 'נשלח', pending: 'בשליחה', failed: 'נכשל', delivered: 'נמסר', read: 'נקרא' };

/** Recipient phone beside the name in send history: dotted edit, or "הוסף טלפון" when missing. */
function HistoryPhoneField({ userId, name, phone }: { userId: string; name: string; phone: string | null }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(phone ? formatPhoneDisplay(phone) : '');
  const save = useMutation({
    mutationFn: () => invoke('admin-broker-contact', { action: 'save', user_id: userId, phone: value.trim() }),
    onSuccess: () => { toast.success('הטלפון נשמר'); setEditing(false); void qc.invalidateQueries({ queryKey: ['broker-contact-history'] }); void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (editing) return <span className="inline-flex shrink-0 items-center">
    <Input autoFocus aria-label={`טלפון של ${name}`} className="h-8 w-28 px-2 text-sm" dir="ltr" inputMode="tel" placeholder="05X-XXXXXXX" value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && value.trim()) save.mutate(); if (e.key === 'Escape') setEditing(false); }} />
    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="שמירת טלפון" disabled={!value.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</Button>
    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="ביטול" onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
  </span>;
  return <span className="inline-flex shrink-0 items-center">
    <button type="button" dir={phone ? 'ltr' : 'rtl'} onClick={() => { setValue(phone ? formatPhoneDisplay(phone) : ''); setEditing(true); }} aria-label={phone ? `עריכת הטלפון של ${name}` : `הוספת טלפון ל${name}`} className={`whitespace-nowrap px-1 text-sm underline decoration-dotted underline-offset-4 ${phone ? 'text-muted-foreground' : 'text-primary'}`}>{phone ? formatPhoneDisplay(phone) : 'הוסף טלפון'}</button>
    {phone && <a href={`tel:+${phone}`} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-primary hover:bg-accent" aria-label={`חיוג אל ${name}`}><Phone className="h-4 w-4" /></a>}
  </span>;
}

function SendHistoryContent({ item }: { item: HistoryItem }) {
  return item.content?.body ? <>
    {item.content.to && <p><span className="font-semibold">אל: </span><span dir="ltr">{item.content.to}</span></p>}
    <p><span className="font-semibold">כותרת: </span>{item.content.subject}</p>
    {item.content.demo && <p className="text-muted-foreground">נשלח כחשבון דמו לצפייה בלבד</p>}
    <p className="whitespace-pre-wrap break-words rounded-md border border-border/60 bg-background p-3 text-base leading-relaxed">{item.content.body}</p>
    {!!item.content.links?.length && <ul className="space-y-1">{item.content.links.map(l => <li key={l.url} className="break-all"><span className="font-semibold">{l.label}: </span><a href={l.url} target="_blank" rel="noreferrer" className="text-primary underline" dir="ltr">{l.url}</a></li>)}</ul>}
    {item.content.error && <p className="text-destructive break-words">{item.content.error}</p>}
  </> : item.content?.template ? <p>נשלחה תבנית WhatsApp מאושרת: <span dir="ltr">{item.content.template}</span></p> : <p className="text-muted-foreground">התוכן המלא לא נשמר עבור שליחה זו (נשלחה לפני הוספת התיעוד).</p>;
}

function SendHistory() {
  const q = useQuery({ queryKey: ['broker-contact-history'], queryFn: () => invoke<{ items: HistoryItem[] }>('admin-broker-contact', { action: 'history' }) });
  const items = threadInvitationHistory(q.data?.items ?? []);
  const ownerIds = Array.from(new Set(items.map(i => i.user_id))).sort();
  const contacts = useQuery({ queryKey: ['marketing-contacts', ownerIds.join(',')], enabled: ownerIds.length > 0, queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_marketing_contacts', { _owners: ownerIds });
    if (error) throw error; return new Map((data ?? []).map(r => [r.owner_id, r as MarketingContact]));
  } });
  const [group, setGroup] = useState<RecipientGroup>('broker');
  const sendCount = (g: RecipientGroup) => items.filter(i => recipientGroup(i, contacts.data?.get(i.user_id)?.company_name) === g).length;
  const shown = items.filter(i => recipientGroup(i, contacts.data?.get(i.user_id)?.company_name) === group);
  const [openKey, setOpenKey] = useState<string | null>(() => readSuperAdminViewState().openSendKey ?? null);
  const toggleOpen = (key: string) => {
    const next = openKey === key ? null : key;
    setOpenKey(next);
    saveSuperAdminViewState({ openSendKey: next });
  };
  return <div className="space-y-3">
    <Tabs value={group} onValueChange={v => setGroup(v as RecipientGroup)} dir="rtl"><TabsList className="grid w-full grid-cols-3">
      <TabsTrigger value="broker" className="px-1">מתווכים ({sendCount('broker')})</TabsTrigger><TabsTrigger value="developer" className="px-1">יזמים ({sendCount('developer')})</TabsTrigger><TabsTrigger value="marketing" className="px-1">חברות שיווק ({sendCount('marketing')})</TabsTrigger>
    </TabsList></Tabs>
    {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : q.isError ? <p role="alert" className="text-base text-destructive">{(q.error as Error).message}</p> : shown.length === 0 ? <p className="text-base text-muted-foreground">אין שליחות בלשונית זו.</p> :
      <ul className="divide-y divide-border/70 rounded-xl border border-border/70">{shown.map(i => { const key = invitationHistoryKey(i); const isOpen = openKey === key; const contact = contacts.data?.get(i.user_id); return <li key={key}>
        {(() => { const isBroker = recipientGroup(i, contact?.company_name) === 'broker'; const statusLine = <p className="text-sm text-muted-foreground">{i.channel === 'whatsapp' ? 'וואטסאפ' : 'מייל'} · {STATUS[i.status] ?? i.status} · {new Date(i.sent_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</p>;
          return <div className="flex w-full items-start gap-3 p-3 text-right">
            {isBroker ? (i.avatar_url ? <img src={i.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" /> : <span className="h-10 w-10 shrink-0" />) : <DeveloperLogo name={i.full_name} logoUrl={i.developer_logo_url ?? null} className="h-10 w-10" />}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex min-w-0 items-center gap-1"><p className="truncate text-base font-bold">{i.full_name || 'ללא שם'}</p><HistoryPhoneField userId={i.user_id} name={i.full_name} phone={i.phone ?? null} /></div>
              {isBroker ? i.office_name && <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">{i.office_logo_url && <img src={i.office_logo_url} alt={`לוגו ${i.office_name}`} className="h-7 w-7 shrink-0 rounded-md object-contain" />}<span className="truncate">{i.office_name}</span></p>
                : <MarketingContactLine ownerId={i.user_id} devName={i.full_name} contact={contact} avatarUrl={i.avatar_url} />}
              {statusLine}
            </div>
            <button type="button" aria-expanded={isOpen} aria-label={isOpen ? 'סגירת פרטי השליחה' : 'פתיחת פרטי השליחה'} onClick={() => toggleOpen(key)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-muted/40"><ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} /></button>
          </div>; })()}
        <div className={`grid transition-all duration-300 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}><div className="overflow-hidden"><div className="space-y-2 border-t border-border/60 bg-muted/20 p-3 text-sm">
          <SendHistoryContent item={i} />
          {i.followups.map(followup => <div key={invitationHistoryKey(followup)} className="space-y-2 border-t border-border/60 pt-3">
            <p className="font-semibold">הודעת המשך · {STATUS[followup.status] ?? followup.status} · {new Date(followup.sent_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</p>
            <SendHistoryContent item={followup} />
          </div>)}
        </div></div></div>
      </li>; })}</ul>}
  </div>;
}

type ImportItem = { id: string; kind: 'developer' | 'broker'; name: string; logo_url: string | null; avatar_url?: string | null; workspace_owner_id?: string | null; public_user_id?: string | null; agency_imported: boolean; agency_name?: string | null; projects: number; imported_at: string; status?: string; error?: string | null };

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
  const [kind, setKind] = useState<'broker' | 'developer'>('broker');
  const allImports = q.data?.items ?? [];
  const items = allImports.filter(i => i.kind === kind);
  const kindTabs = <Tabs value={kind} onValueChange={v => setKind(v as 'broker' | 'developer')} dir="rtl" className="mb-3"><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="broker">מתווכים ({allImports.filter(i => i.kind === 'broker').length})</TabsTrigger><TabsTrigger value="developer">יזמים ({allImports.filter(i => i.kind === 'developer').length})</TabsTrigger></TabsList></Tabs>;
  if (q.isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (q.isError) return <p role="alert" className="text-base text-destructive">{(q.error as Error).message}</p>;
  if (!items.length) return <div>{kindTabs}<p className="text-base text-muted-foreground">אין יבואים בלשונית זו.</p></div>;
  return <div>{kindTabs}<div className="overflow-x-auto rounded-xl border border-border/70">
    <table className="w-full min-w-[520px] text-right text-sm">
      <thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-2 font-semibold">לוגו</th><th className="p-2 font-semibold">שם</th><th className="p-2 font-semibold">סוג</th><th className="p-2 font-semibold">{'פרויקטים/נכסים'}</th><th className="p-2 font-semibold">סטטוס</th><th className="p-2 font-semibold">תאריך</th><th className="p-2"><span className="sr-only">מחיקת רשומה</span></th></tr></thead>
      <tbody className="divide-y divide-border/70">{items.map(i => <tr key={`${i.kind}-${i.id}`}>
        <td className="p-2">{i.kind === 'developer' ? <DeveloperLogo name={i.name} logoUrl={i.logo_url} className="h-8 w-8" /> : i.logo_url ? <img src={i.logo_url} alt="לוגו שיובא" className="h-8 w-8 rounded-md object-contain" /> : <X className="h-4 w-4 text-muted-foreground" aria-label="חסר" />}</td>
        <td className="p-2"><Button variant="ghost" className="h-auto justify-start gap-2 p-0 text-right font-bold whitespace-normal" disabled={!i.workspace_owner_id || opening !== null} aria-label={`פתיחת ${i.kind === 'developer' ? 'הפרויקטים' : 'הנכסים'} של ${i.name}`} onClick={() => void openInventory(i)}>{i.avatar_url && <img src={i.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />}<span>{i.name || 'ללא שם'}</span>{opening === i.id && <Loader2 className="h-4 w-4 animate-spin" />}</Button></td>
        <td className="p-2">{i.kind === 'developer' ? 'יזם' : 'מתווך'}</td>
        <td className="p-2">{i.projects}</td>
        <td className="p-2 whitespace-nowrap" title={i.error ?? undefined}>{i.status === 'failed' ? <span className="text-destructive">נכשל</span> : i.status === 'completed' || !i.status ? 'הושלם' : 'בתהליך'}</td>
        <td className="p-2 whitespace-nowrap">{new Date(i.imported_at).toLocaleDateString('he-IL')}</td>
        <td className="p-2"><Button variant="ghost" size="icon" className="text-destructive" title="מחיקת רשומה מההיסטוריה" aria-label={`מחיקת רשומת היבוא של ${i.name}`} onClick={() => setDeleting(i)}><Trash2 className="h-4 w-4" /></Button></td>
      </tr>)}</tbody>
    </table>
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !remove.isPending) setDeleting(null); }}><DialogContent dir="rtl"><DialogHeader><DialogTitle>מחיקת רשומה מההיסטוריה</DialogTitle></DialogHeader><p>למחוק את רשומת היבוא של {deleting?.name}? החשבון, הפרויקטים והנכסים יישארו ללא שינוי.</p><DialogFooter className="flex-row justify-between sm:justify-between"><Button variant="outline" disabled={remove.isPending} onClick={() => setDeleting(null)}>ביטול</Button><Button variant="destructive" disabled={remove.isPending} onClick={() => { if (deleting) remove.mutate(deleting); }}>{remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}מחיקה</Button></DialogFooter></DialogContent></Dialog>
  </div></div>;
}

/** Silently imported accounts awaiting their first successful invitation. */
export function usePendingInvitations() {
  return useQuery({ queryKey: ['broker-contact-queue'], queryFn: () => invoke<{ brokers: ContactBroker[] }>('admin-broker-contact', { action: 'list' }), refetchOnWindowFocus: true, refetchInterval: 30000 });
}

function PendingInvitations() {
  const q = usePendingInvitations();
  const all = q.data?.brokers ?? [];
  const [group, setGroup] = useState<RecipientGroup>('broker');
  const devIds = all.filter(b => b.is_developer).map(b => b.user_id);
  const marketing = useQuery({ queryKey: ['marketing-contacts', devIds.join(',')], enabled: devIds.length > 0, queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_marketing_contacts', { _owners: devIds });
    if (error) throw error; return new Map((data ?? []).map(r => [r.owner_id, r as MarketingContact]));
  } });
  const groupOf = (b: ContactBroker) => recipientGroup({ recipient_kind: b.is_developer ? 'developer' : 'broker' }, marketing.data?.get(b.user_id)?.company_name);
  const count = (g: RecipientGroup) => all.filter(b => groupOf(b) === g).length;
  const brokers = all.filter(b => groupOf(b) === group);
  return <div className="space-y-4">
    <Tabs value={group} onValueChange={v => setGroup(v as RecipientGroup)} dir="rtl"><TabsList className="grid w-full grid-cols-3">
      <TabsTrigger value="broker" className="px-1">מתווכים ({count('broker')})</TabsTrigger><TabsTrigger value="developer" className="px-1">יזמים ({count('developer')})</TabsTrigger><TabsTrigger value="marketing" className="px-1">חברות שיווק ({count('marketing')})</TabsTrigger>
    </TabsList></Tabs>
    {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : q.isError ? <p role="alert" className="text-base text-destructive">{(q.error as Error).message}</p> : brokers.length === 0 ? <p className="text-base text-muted-foreground">אין חשבונות שממתינים להזמנה ראשונה.</p> :
      <ul className="space-y-3">{brokers.map(b => <BrokerRow key={b.user_id} b={b} marketing={marketing.data?.get(b.user_id)} />)}</ul>}
  </div>;
}

export type BrokerContactView = 'pending' | 'imports' | 'sends';

export function BrokerContactQueueCard({ view = 'pending' }: { view?: BrokerContactView }) {
  return <section dir="rtl" className="py-5 text-right">
    {view === 'pending' ? <PendingInvitations /> : view === 'imports' ? <ImportHistory /> : <SendHistory />}
  </section>;
}
