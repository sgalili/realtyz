import { importRatioLabel } from '@/lib/importRatio';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Loader2, Mail, UserRoundSearch, Check, X, Trash2, ShieldCheck, ChevronDown, Phone } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BrokerRegistryNameButton } from './BrokerRegistryNameButton';
import { MarketingContactLine, type MarketingContact } from './MarketingContactLine';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { InvitationAttachmentPicker } from './InvitationAttachmentPicker';
import { recipientGroup, type RecipientGroup } from '@/lib/invitationSummaries';
import { BrokerEmailConsentButton } from './BrokerEmailInvitations';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { toast } from 'sonner';
import { useNavigate } from '@/lib/router-compat';
import { useSuperAdminGate as useAdminGate } from '@/hooks/useSuperAdminGate';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useWorkspace } from '@/hooks/useWorkspace';
import { returnState } from '@/lib/returnNav';
import { invitationHistoryKey, threadInvitationHistory } from '@/lib/invitationHistory';
import { readSuperAdminViewState, saveSuperAdminViewState } from '@/lib/superAdminViewState';
import { DeveloperLogo } from '@/components/developers/DeveloperLogo';
import { BrokerWhatsAppContact } from './BrokerWhatsAppContact';
import { BrokerNumberEditor } from './BrokerNumberEditor';
import { sortDiscoveryPriority, nextDiscoverySort, type DiscoverySortMode } from '@/lib/brokerDiscoveryPriority';
import { BrokerScannerPanel, scannerCall } from './BrokerScannerPanel';
import { emptyImportSearch, matchesImportSearch, newestImportsFirst, type ImportSearch } from '@/lib/adminImportPresentation';
import { useAdminImportJobs } from '@/hooks/useAdminImportJobs';
import { activeImportHistoryIds } from '@/lib/importHistoryActivity';
import { firstContactBody } from '../../../supabase/functions/_shared/brokerInvitationTemplate';
import { brokerWhatsAppRequest } from '@/lib/brokerWhatsAppRequest';
import { brokerUserError } from '../../../supabase/functions/_shared/brokerRecovery';

export type ContactBroker = { created_at?: string; user_id: string; full_name: string; phone: string | null; whatsapp_phone?: string | null; whatsapp_link?: string | null; email: string | null; license_number: string | null; office_name: string | null; office_logo_url?: string | null; avatar_url?: string | null; is_developer?: boolean; profile_license?: string | null; city?: string | null; license_verified?: boolean; registry_no_match?: boolean; gender?: string | null; drafts: number; yad2_total?: number | null; importing?: boolean; projects?: number; apartments?: number; contact_status: 'pending_contact' | 'complete'; first_login_at: string | null; email_consent_at: string | null; email_invited_at: string | null };

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  return brokerWhatsAppRequest<T>(fn, body);
}

const DEFAULT_SUBJECT = 'TORAFF · המערכת היחידה שכל מתווך חייב';
const DEFAULT_EMAIL = (name: string) => firstContactBody('email').replace('{brokerName}', name);

function EmailSendDialog({ b, contactPhone, contactName }: { b: ContactBroker; contactPhone?: string | null; contactName?: string | null }) {
  // Greeting and title use the actual recipient: the saved contact person when set, otherwise the account holder.
  const recipientName = (contactName?.trim() || b.full_name || '').trim();
  const recipientFirst = recipientName.split(/\s+/)[0] || '';
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(b.email ?? '');
  const [body, setBody] = useState(() => DEFAULT_EMAIL(recipientFirst));
  const bodyTouched = useRef(false);
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [attachmentId, setAttachmentId] = useState<string | null>(null);
  // Same gender-matched default wording as the WhatsApp template, filled with the recipient's first name.
  const sharedText = useQuery({ queryKey: ['broker-template-texts', 'recipient', b.user_id], enabled: open, queryFn: () => invoke<{ email_recipient?: string; demo_link?: string }>('admin-broker-invitation', { action: 'texts', broker_id: b.user_id }) });
  useEffect(() => {
    const t = sharedText.data?.email_recipient;
    if (!t || bodyTouched.current) return;
    setBody(t.replace(/\{brokerName\}|\[שם פרטי\]/g, recipientFirst).trim());
  }, [sharedText.data, recipientFirst]);
  const saveEmail = useMutation({
    mutationFn: () => invoke('admin-broker-contact', { action: 'save', user_id: b.user_id, email: email.trim() }),
    onSuccess: () => { toast.success('האימייל נשמר'); void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const send = useMutation({
    mutationFn: () => invoke<{ sent: number; results?: { status: string; error?: string }[] }>('admin-broker-email-invitation', { action: 'send_batch', broker_id: b.user_id, limit: 1, message: body.trim(), first_contact: true, subject: subject.trim() || DEFAULT_SUBJECT, attachment_id: attachmentId }),
    onSuccess: d => { if (d.sent) { toast.success('המייל נשלח'); setOpen(false); } else { const r = d.results?.[0]; toast.error(r?.status === 'skipped' ? 'המייל לא נשלח: כבר נשלחה הזמנה או שהחשבון כבר נכנס' : `המייל לא נשלח${r?.error ? `: ${brokerUserError(r.error)}` : ''}`); } void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); void qc.invalidateQueries({ queryKey: ['broker-contact-history'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  // Global save: the edited wording (first name restored to its placeholder) becomes the default for future email invites only.
  const saveGlobal = useMutation({
    mutationFn: () => { const first = recipientFirst.trim(); const text = first ? body.trim().replace(new RegExp(`^(היי\\s+)${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '$1{brokerName}') : body.trim(); return invoke('admin-broker-invitation', { action: 'save_email_text', text }); },
    onSuccess: () => { toast.success('הנוסח נשמר כברירת המחדל למיילים'); void qc.invalidateQueries({ queryKey: ['broker-template-texts'] }); },
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
    <Button variant="ghost" className={`h-7 gap-1 px-0.5 font-normal sm:h-8 ${b.email ? 'min-w-0 max-w-24 sm:max-w-40' : 'min-w-[78px]'}`} aria-label={`שליחת הודעה במייל ל${b.full_name || 'מתווך'}`} title={b.email || 'הוסף מייל'} onClick={() => setOpen(true)}><span dir={b.email ? 'ltr' : 'rtl'} className={`min-w-0 text-xs ${b.email ? 'truncate' : 'whitespace-nowrap'}`}>{b.email || 'הוסף מייל'}</span><Mail className="h-4 w-4 shrink-0" /></Button>
    <Dialog open={open} onOpenChange={v => { if (!send.isPending) setOpen(v); }}>
      <DialogContent dir="rtl" className="w-[calc(100%-2rem)] max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto text-right">
        <DialogHeader><DialogTitle>הזמנה במייל ל{recipientName || 'מתווך'}</DialogTitle><DialogDescription className="sr-only">שליחת הזמנה במייל בלבד</DialogDescription></DialogHeader>
        <div className="space-y-3">
        <div className="flex gap-2">
          <Input aria-label="כתובת אימייל" className="h-11 text-base" dir="ltr" type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          <Button variant="outline" className="h-11" disabled={!email.trim() || !emailDirty || saveEmail.isPending} onClick={() => saveEmail.mutate()}>{saveEmail.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}שמירה</Button>
        </div>
        {b.email && !b.email_consent_at && <div className="flex items-center gap-2 text-sm text-muted-foreground">נדרשת הסכמה מתועדת לפני שליחה:<BrokerEmailConsentButton broker={{ id: b.user_id, full_name: b.full_name, email: b.email }} state={{ email_consent_at: b.email_consent_at, email_unsubscribed_at: null, email_invited_at: b.email_invited_at }} /></div>}
        <label className="block space-y-1"><span className="text-sm font-medium">כותרת המייל</span><Input aria-label="כותרת המייל" className="h-11 text-base" maxLength={200} value={subject} onChange={e => setSubject(e.target.value)} /></label>
        <Textarea aria-label="נוסח המייל" className="min-h-[200px] text-base" value={body} onChange={e => { bodyTouched.current = true; setBody(e.target.value); }} />
        <InvitationAttachmentPicker compact value={attachmentId} onChange={setAttachmentId} recipientRole={contactPhone ? 'marketing_company' : b.is_developer ? 'developer' : 'broker'} />
        <p className="text-sm text-muted-foreground">כפתור לפתיחת שיחת וואטסאפ איתנו וקישור הסרה מתווספים אוטומטית. כתובת הנכס ממודעת יד2 נכנסת אוטומטית במקום {'{propertyAddress}'}.</p>
        {b.email_invited_at && <p className="text-sm text-muted-foreground">כבר נשלחה פנייה במייל למתווך זה.</p>}
        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <div className="flex gap-2"><Button variant="outline" disabled={send.isPending} onClick={() => setOpen(false)}>ביטול</Button><Button variant="outline" disabled={saveGlobal.isPending || body.trim().length < 20} onClick={() => saveGlobal.mutate()}>{saveGlobal.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}שמירה כללית</Button></div>
          <Button disabled={send.isPending} onClick={() => void trySend()}>{send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}שליחה</Button>
        </DialogFooter>
        </div>
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
function OfficeNameField({ b, showLogo = true }: { b: ContactBroker; showLogo?: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(b.office_name ?? '');
  const save = useMutation({
    mutationFn: () => invoke('admin-broker-contact', { action: 'save', user_id: b.user_id, office_name: value.trim() }),
    onSuccess: () => { toast.success('שם המשרד נשמר'); setEditing(false); void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const commit = () => { if (value.trim().length < 2) { toast.error('שם המשרד קצר מדי'); return; } save.mutate(); };
  if (editing) return <span className="flex min-w-0 items-center gap-1">
    <Input autoFocus aria-label="שם משרד התיווך" className="h-8 min-w-0 w-40 px-2 text-sm sm:text-base" value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }} />
    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="שמירת שם המשרד" disabled={save.isPending} onClick={commit}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</Button>
    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="ביטול" onClick={() => { setValue(b.office_name ?? ''); setEditing(false); }}><X className="h-4 w-4" /></Button>
  </span>;
  return <span className="flex min-w-0 shrink items-center gap-1.5">
    {showLogo && (b.is_developer ? <DeveloperLogo name={b.office_name} logoUrl={b.office_logo_url} className="h-7 w-7" /> : b.office_logo_url && <img src={b.office_logo_url} alt="" className="h-7 w-7 shrink-0 rounded-md object-contain" />)}
    <button type="button" disabled={!!b.first_login_at} onClick={() => setEditing(true)} aria-label="עריכת שם משרד התיווך" className={`min-w-0 break-words text-right text-sm font-bold underline decoration-dotted underline-offset-4 disabled:no-underline sm:text-base ${b.office_name ? 'text-foreground' : 'text-primary'}`}>{b.office_name || 'הוסף משרד תיווך'}</button>
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
      void supabase.functions.invoke('sync-owner-wa-avatar', { body: { owner_id: b.user_id } }).then(({ data }) => { if (data?.updated) { toast.success('תמונת הפרופיל יובאה מ-WhatsApp'); void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); } }).catch(() => {});
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
  const regLicense = b.profile_license?.trim() || b.license_number?.trim();
  const hasSelectedGender = b.gender === 'male' || b.gender === 'female';
  const setGender = useMutation({
    mutationFn: (gender: 'male' | 'female') => invoke('admin-broker-contact', { action: 'save', user_id: b.user_id, gender }),
    onSuccess: () => { toast.success('המגדר נשמר'); void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const details = `${b.projects ?? 0} פרויקטים • ${b.apartments ?? 0} דירות במאגר`;
  const [statusSlot, setStatusSlot] = useState<HTMLDivElement | null>(null);
  const phoneControls = !b.is_developer ? <span className="inline-flex min-w-0 items-center"><BrokerNumberEditor brokerId={b.user_id} name={b.full_name} phone={b.phone} kind="phone" />{b.phone && <a href={`tel:+${b.phone}`} className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-primary" aria-label={`חיוג אל ${b.full_name} ${formatPhoneDisplay(b.phone)}`}><Phone className="h-4 w-4" /></a>}</span> : editing ? <>
          <Input autoFocus aria-label={`נייד (WhatsApp) של ${b.full_name}`} className="h-8 w-24 px-2 text-sm sm:w-36 sm:text-base" dir="ltr" inputMode="tel" placeholder="05X-XXXXXXX" value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && dirty) save.mutate(); if (e.key === 'Escape') setEditing(false); }} />
          <Button size="icon" variant="ghost" className="h-7 w-7 sm:h-8 sm:w-8" aria-label="שמירת נייד" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 sm:h-8 sm:w-8" aria-label="ביטול" onClick={() => { setPhone(b.phone ? formatPhoneDisplay(b.phone) : ''); setEditing(false); }}><X className="h-4 w-4" /></Button>
        </> : <>
          <button type="button" dir={b.phone ? 'ltr' : 'rtl'} disabled={!!b.first_login_at} title="נייד" aria-label={b.phone ? `עריכת הנייד של ${b.full_name}` : `הוספת נייד ל${b.full_name}`} onClick={() => setEditing(true)} className={`whitespace-nowrap px-1 text-xs underline decoration-dotted underline-offset-4 disabled:no-underline sm:text-base ${b.phone ? '' : 'text-primary'}`}>{b.phone ? formatPhoneDisplay(b.phone) : 'הוסף טלפון'}</button>
          {b.phone && <a href={`tel:+${b.phone}`} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-primary hover:bg-accent" aria-label={`חיוג אל ${b.full_name} ${formatPhoneDisplay(b.phone)}`} title={formatPhoneDisplay(b.phone)}><Phone className="h-4 w-4" /></a>}
        </>;
  return <li data-broker-card={b.is_developer ? undefined : b.user_id} className="space-y-2 rounded-xl border border-border/70 p-3 sm:p-4">
    <div className={b.is_developer ? "flex flex-wrap items-center gap-1" : "flex flex-col gap-2"}>
      <div data-broker-row="identity" className="flex min-w-0 flex-1 items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
        {b.license_verified ? <ShieldCheck className="h-4 w-4 shrink-0 text-success" aria-label="אומת מול המאגר הממשלתי" /> : !b.is_developer && <BrokerRegistryNameButton compact userId={b.user_id} license={regLicense??''} noMatch={b.registry_no_match ?? false} onUpdated={() => void qc.invalidateQueries({queryKey:['broker-contact-queue']})} />}
        <button type="button" onClick={() => void openWs(b.user_id, b.is_developer)} className="flex min-w-0 items-center gap-2 rounded-lg text-right hover:opacity-90" aria-label={`מעבר אל ${dest} של ${b.full_name}`}>
          {b.is_developer ? <DeveloperLogo name={b.full_name} logoUrl={b.office_logo_url} className="h-9 w-9" /> : b.avatar_url ? <img src={b.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : null}
          <span className="flex min-w-0 items-center gap-1 text-base sm:text-lg"><span className="min-w-0 break-words font-bold">{b.full_name || 'ללא שם'}</span>{!b.is_developer && regLicense && <span dir="ltr" className="shrink-0 whitespace-nowrap text-sm font-normal text-muted-foreground sm:text-base">{regLicense}</span>}{!b.is_developer && <span dir="ltr" title="יובאו / סה״כ ביד2" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-normal tabular-nums text-muted-foreground sm:text-base">{importRatioLabel(b.drafts, b.yad2_total)}{b.importing && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary motion-reduce:animate-none" aria-label="הייבוא פעיל" />}</span>}</span>
        </button>
        {!b.is_developer && !hasSelectedGender && <div role="radiogroup" aria-label="מגדר המתווך" className="flex shrink-0">{([['male', 'גבר', '\u2642\uFE0E'], ['female', 'אישה', '\u2640\uFE0E']] as const).map(([g, label, icon]) => <Button key={g} type="button" size="icon" variant="ghost" role="radio" aria-checked={false} aria-label={label} title={label} className={`h-7 w-7 text-base ${g === 'male' ? 'text-gender-male' : 'text-gender-female'}`} disabled={setGender.isPending} onClick={() => setGender.mutate(g)}>{icon}</Button>)}</div>}
        </div>
        {!b.is_developer && <div className="flex min-w-0 max-w-[45%] items-center justify-end gap-2">{b.city && <span className="min-w-0 break-words text-sm text-muted-foreground sm:text-base">{b.city}</span>}<OfficeNameField b={b} /></div>}
      </div>
      <div data-broker-row="contacts" className={b.is_developer ? "flex max-w-full flex-wrap items-center gap-0" : "flex min-w-0 max-w-full flex-nowrap items-center gap-x-1 gap-y-0"}>
        {phoneControls}
        {!b.is_developer && <BrokerWhatsAppContact brokerId={b.user_id} name={b.full_name} phone={b.whatsapp_phone} statusSlot={statusSlot} />}
        <EmailSendDialog b={b} contactPhone={marketing?.contact_phone} contactName={marketing?.contact_name} />
        <Button size="icon" variant="ghost" className={`h-8 w-8 shrink-0 text-destructive ${b.is_developer ? '' : 'ms-auto'}`} aria-label={`מחיקת החשבון של ${b.full_name || 'ללא שם'}`} title="מחיקת החשבון" disabled={remove.isPending} onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4" /></Button>
      </div>
      {!b.is_developer && <div ref={setStatusSlot} data-broker-row="status" className="-mt-1 empty:hidden" />}
    </div>
    {b.is_developer && <div data-broker-row="office" className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap">
      <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground sm:text-base" title={details}>{details}</p>
    </div>}
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
    {item.content.error && <p className="text-destructive break-words">{brokerUserError(item.content.error)}</p>}
  </> : item.content?.template ? <p>נשלחה תבנית WhatsApp מאושרת: <span dir="ltr">{item.content.template}</span></p> : <p className="text-muted-foreground">התוכן המלא לא נשמר עבור שליחה זו (נשלחה לפני הוספת התיעוד).</p>;
}

export function useSendHistoryRows() {
  const gate = useAdminGate();
  return useQuery({ queryKey: ['broker-contact-history', gate.uid], enabled: gate.enabled, queryFn: () => invoke<{ items: HistoryItem[] }>('admin-broker-contact', { action: 'history' }) });
}

function SendHistory({ search }: { search: ImportSearch }) {
  const q = useSendHistoryRows();
  const gate = useAdminGate();
  const [prioritySort, setPrioritySort] = useState<DiscoverySortMode>('off');
  const scanner = useQuery({ queryKey: ['broker-wa-scanner', gate.uid], enabled: gate.enabled, retry: false, queryFn: () => scannerCall({ action: 'status' }), refetchInterval: 15000 });
  const items = threadInvitationHistory(q.data?.items ?? []);
  const ownerIds = Array.from(new Set(items.map(i => i.user_id))).sort();
  const contacts = useQuery({ queryKey: ['marketing-contacts', ownerIds.join(',')], enabled: ownerIds.length > 0, queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_marketing_contacts', { _owners: ownerIds });
    if (error) throw error; return new Map((data ?? []).map(r => [r.owner_id, r as MarketingContact]));
  } });
  const [group, setGroup] = useState<RecipientGroup>(() => readSuperAdminViewState().sendGroup ?? 'broker');
  useEffect(() => saveSuperAdminViewState({ sendGroup: group }), [group]);
  const sendCount = (g: RecipientGroup) => items.filter(i => recipientGroup(i, contacts.data?.get(i.user_id)?.company_name) === g).length;
  const searching = search.text.trim() || search.kind !== 'all' || search.channel !== 'all';
  const filteredItems = items.filter(i => (searching || recipientGroup(i, contacts.data?.get(i.user_id)?.company_name) === group) && matchesImportSearch({ ...i, kind: recipientGroup(i, contacts.data?.get(i.user_id)?.company_name) }, { ...search, whatsapp: 'all' }));
  const shown = prioritySort !== 'off' ? sortDiscoveryPriority(filteredItems, scanner.data?.overview?.rows ?? [], prioritySort) : filteredItems;
  const [openKey, setOpenKey] = useState<string | null>(() => readSuperAdminViewState().openSendKey ?? null);
  const toggleOpen = (key: string) => {
    const next = openKey === key ? null : key;
    setOpenKey(next);
    saveSuperAdminViewState({ openSendKey: next });
  };
  return <div className="space-y-3">
    <Tabs value={group} onValueChange={v => setGroup(v as RecipientGroup)} dir="rtl"><TabsList secondary className="grid w-full grid-cols-3">
      <TabsTrigger value="broker" className="px-1">מתווכים ({sendCount('broker')})</TabsTrigger><TabsTrigger value="developer" className="px-1">יזמים ({sendCount('developer')})</TabsTrigger><TabsTrigger value="marketing" className="px-1">חברות שיווק ({sendCount('marketing')})</TabsTrigger>
    </TabsList></Tabs>
    {group === 'broker' && <BrokerScannerPanel prioritySort={prioritySort} onPrioritySort={() => setPrioritySort(nextDiscoverySort)} />}
    {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : q.isError && !q.data ? <p role="alert" className="text-base text-destructive">{brokerUserError(q.error)}</p> : shown.length === 0 ? <p className="text-base text-muted-foreground">אין שליחות בלשונית זו.</p> :
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

type ImportItem = { id: string; kind: 'developer' | 'broker'; name: string; logo_url: string | null; avatar_url?: string | null; workspace_owner_id?: string | null; public_user_id?: string | null; source_url?: string | null; agency_imported: boolean; agency_name?: string | null; projects: number; yad2_total?: number | null; imported_at: string; status?: string; error?: string | null };

/** Row identity shown inside the name cell: saved office/company logo first, then the profile photo. No placeholder when neither exists. */
function ImportIdentityImage({ item }: { item: ImportItem }) {
  if (item.kind === 'developer' && item.logo_url) return <DeveloperLogo name={item.name} logoUrl={item.logo_url} className="h-8 w-8" />;
  if (item.logo_url) return <img src={item.logo_url} alt={`לוגו ${item.name || ''}`} className="h-8 w-8 shrink-0 rounded-md object-contain" />;
  if (item.avatar_url) return <img src={item.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />;
  return null;
}

/** Properties/projects count. While the import is still running the number sits centered inside a spinning loader ring. */
function ImportCount({ item, running }: { item: ImportItem; running: boolean }) {
  const label = item.kind === 'developer' ? 'פרויקטים' : 'נכסים';
  return <span role={running ? 'img' : undefined} aria-label={running ? `${label} נטענים · ${item.projects}` : undefined} className="relative inline-grid h-9 min-w-9 place-items-center px-1">
    {running && <span aria-hidden="true" className="absolute inset-0 animate-spin rounded-full border-2 border-primary/25 border-t-primary motion-reduce:animate-none" />}
    <span className={`text-sm font-bold tabular-nums ${!running && item.status === 'failed' ? 'text-destructive' : ''}`} title={!running && item.status === 'failed' && item.error ? brokerUserError(item.error) : undefined}>{item.kind === 'broker' ? <span dir="ltr">{importRatioLabel(item.projects, item.yad2_total)}</span> : item.projects}</span>
  </span>;
}

export function useImportHistoryRows() {
  const gate = useAdminGate();
  return useQuery({ queryKey: ['broker-import-history', gate.uid], enabled: gate.enabled, queryFn: () => invoke<{ items: ImportItem[] }>('admin-broker-contact', { action: 'imports' }) });
}

export function ImportHistory({ search = emptyImportSearch }: { search?: ImportSearch }) {
  const { data: progress } = useAdminImportJobs();
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
  const q = useImportHistoryRows();
  useEffect(() => { if (progress?.[0]?.status !== 'running') return; const timer = setInterval(() => void q.refetch(), 4000); return () => clearInterval(timer); }, [progress?.[0]?.status, q.refetch]);
  const [kind, setKind] = useState<'broker' | 'developer'>(() => readSuperAdminViewState().importKind ?? 'broker');
  useEffect(() => saveSuperAdminViewState({ importKind: kind }), [kind]);
  const allImports = q.data?.items ?? [];
  const activeIds = activeImportHistoryIds(allImports, progress);
  // Rows whose account was removed have no workspace and render grayed out: list them last and leave them out of tab counts.
  const isRemoved = (i: ImportItem) => !i.workspace_owner_id;
  const searching = search.text.trim() || search.kind !== 'all';
  const items = allImports.filter(i => (searching || i.kind === kind) && matchesImportSearch({ ...i }, { ...search, channel: 'all', whatsapp: 'all' })).sort((a, b) => Number(isRemoved(a)) - Number(isRemoved(b)));
  const kindTabs = <Tabs value={kind} onValueChange={v => setKind(v as 'broker' | 'developer')} dir="rtl" className="mb-3"><TabsList secondary className="grid w-full grid-cols-2"><TabsTrigger value="broker">מתווכים ({allImports.filter(i => i.kind === 'broker' && !isRemoved(i)).length})</TabsTrigger><TabsTrigger value="developer">יזמים ({allImports.filter(i => i.kind === 'developer' && !isRemoved(i)).length})</TabsTrigger></TabsList></Tabs>;
  if (q.isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (q.isError && !q.data) return <p role="alert" className="text-base text-destructive">{brokerUserError(q.error)}</p>;
  if (!items.length) return <div>{kindTabs}<p className="text-base text-muted-foreground">אין יבואים בלשונית זו.</p></div>;
  return <div>{kindTabs}<div className="overflow-x-auto rounded-xl border border-border/70">
    <table className="w-full min-w-[380px] text-right text-sm">
      <thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-2 font-semibold">שם</th><th className="p-2 font-semibold">{kind === 'developer' ? 'פרויקטים' : 'נכסים'}</th><th className="p-2 font-semibold">תאריך</th><th className="p-2"><span className="sr-only">מחיקת רשומה</span></th></tr></thead>
      <tbody className="divide-y divide-border/70">{items.map(i => <tr key={`${i.kind}-${i.id}`}>
        <td className="p-2"><Button variant="ghost" className="h-auto justify-start gap-2 p-0 text-right font-bold whitespace-normal" disabled={!i.workspace_owner_id || opening !== null} aria-label={`פתיחת ${i.kind === 'developer' ? 'הפרויקטים' : 'הנכסים'} של ${i.name}`} onClick={() => void openInventory(i)}><ImportIdentityImage item={i} /><span>{i.name || 'ללא שם'}</span>{opening === i.id && <Loader2 className="h-4 w-4 animate-spin" />}</Button></td>
        <td className="p-2"><ImportCount item={i} running={activeIds.has(i.id)} /></td>
        <td className="p-2 whitespace-nowrap">{new Date(i.imported_at).toLocaleDateString('he-IL')}</td>
        <td className="p-2"><Button variant="ghost" size="icon" className="text-destructive" title="מחיקת רשומה מההיסטוריה" aria-label={`מחיקת רשומת היבוא של ${i.name}`} onClick={() => setDeleting(i)}><Trash2 className="h-4 w-4" /></Button></td>
      </tr>)}</tbody>
    </table>
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !remove.isPending) setDeleting(null); }}><DialogContent dir="rtl"><DialogHeader><DialogTitle>מחיקת רשומה מההיסטוריה</DialogTitle></DialogHeader><p>למחוק את רשומת היבוא של {deleting?.name}? החשבון, הפרויקטים והנכסים יישארו ללא שינוי.</p><DialogFooter className="flex-row justify-between sm:justify-between"><Button variant="outline" disabled={remove.isPending} onClick={() => setDeleting(null)}>ביטול</Button><Button variant="destructive" disabled={remove.isPending} onClick={() => { if (deleting) remove.mutate(deleting); }}>{remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}מחיקה</Button></DialogFooter></DialogContent></Dialog>
  </div></div>;
}

/** Silently imported accounts awaiting their first successful invitation. */
export function usePendingInvitations() {
  const gate = useAdminGate();
  return useQuery({ queryKey: ['broker-contact-queue', gate.uid], enabled: gate.enabled, queryFn: () => invoke<{ brokers: ContactBroker[] }>('admin-broker-contact', { action: 'list' }), refetchOnWindowFocus: true, refetchInterval: 30000 });
}

function PendingInvitations({ search }: { search: ImportSearch }) {
  const q = usePendingInvitations();
  const all = newestImportsFirst(q.data?.brokers ?? []);
  const gate = useAdminGate();
  const [prioritySort, setPrioritySort] = useState<DiscoverySortMode>('off');
  const scanner = useQuery({ queryKey: ['broker-wa-scanner', gate.uid], enabled: gate.enabled, retry: false, queryFn: () => scannerCall({ action: 'status' }), refetchInterval: 15000 });
  const [group, setGroup] = useState<RecipientGroup>(() => readSuperAdminViewState().pendingGroup ?? 'broker');
  useEffect(() => saveSuperAdminViewState({ pendingGroup: group }), [group]);
  const devIds = all.filter(b => b.is_developer).map(b => b.user_id);
  const marketing = useQuery({ queryKey: ['marketing-contacts', devIds.join(',')], enabled: devIds.length > 0, queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_marketing_contacts', { _owners: devIds });
    if (error) throw error; return new Map((data ?? []).map(r => [r.owner_id, r as MarketingContact]));
  } });
  const groupOf = (b: ContactBroker) => recipientGroup({ recipient_kind: b.is_developer ? 'developer' : 'broker' }, marketing.data?.get(b.user_id)?.company_name);
  const count = (g: RecipientGroup) => all.filter(b => groupOf(b) === g).length;
  const searching = search.text.trim() || search.kind !== 'all' || search.whatsapp !== 'all';
  const filtered = all.filter(b => (searching || groupOf(b) === group) && matchesImportSearch({ ...b, kind: groupOf(b) }, { ...search, channel: 'all' }));
  const brokers = prioritySort !== 'off' ? sortDiscoveryPriority(filtered, scanner.data?.overview?.rows ?? [], prioritySort) : filtered;
  return <div className="space-y-4">
    {/* The scrollport has 20px top padding and the primary band is 76px high. A 56px
        offset therefore joins this row to it, with an opaque background over passing cards. */}
    <div data-import-secondary-tabs className="sticky top-[36px] z-20 -mx-[15px] bg-background px-[15px]">
      <Tabs value={group} onValueChange={v => setGroup(v as RecipientGroup)} dir="rtl"><TabsList secondary className="grid w-full grid-cols-3">
        <TabsTrigger value="broker" className="px-1">מתווכים ({count('broker')})</TabsTrigger><TabsTrigger value="developer" className="px-1">יזמים ({count('developer')})</TabsTrigger><TabsTrigger value="marketing" className="px-1">חברות שיווק ({count('marketing')})</TabsTrigger>
      </TabsList></Tabs>
    </div>
    {group === 'broker' && <BrokerScannerPanel prioritySort={prioritySort} onPrioritySort={() => setPrioritySort(nextDiscoverySort)} />}
    {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : q.isError && !q.data ? <p role="alert" className="text-base text-destructive">{brokerUserError(q.error)}</p> : brokers.length === 0 ? <p className="text-base text-muted-foreground">אין חשבונות שממתינים להזמנה ראשונה.</p> :
      <ul className="space-y-3">{brokers.map(b => <BrokerRow key={b.user_id} b={b} marketing={marketing.data?.get(b.user_id)} />)}</ul>}
  </div>;
}

export type BrokerContactView = 'pending' | 'imports' | 'sends';

export function BrokerContactQueueCard({ view = 'pending', search = emptyImportSearch }: { view?: BrokerContactView; search?: ImportSearch }) {
  return <section dir="rtl" className="pb-5 text-right">
    {view === 'pending' ? <PendingInvitations search={search} /> : view === 'imports' ? <ImportHistory search={search} /> : <SendHistory search={search} />}
  </section>;
}
