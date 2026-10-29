import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Copy, Loader2, Mail, MessageCircle, Phone, Share2, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import WhatsAppIcon from '@/components/properties/WhatsAppIcon';
import { officialWaLink, openWhatsAppContactPicker } from '@/lib/officialWa';
import { openExternal } from '@/lib/openExternal';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cleanFormFields, type LeadContactOptions } from '@/lib/leadTiers';
import InquiryVerificationDialog, { inquiryDeviceId, type InquiryChallenge } from '@/components/public/InquiryVerificationDialog';
import { personalPropertyLink, propertyInquiryRef } from '@/lib/propertyReferral';
import BrokerageCommissionDisclosure from './BrokerageCommissionDisclosure';

export type ContactOptions = LeadContactOptions;

/**
 * Contact row on a public property page. Which actions appear is decided by the
 * publisher's lead prices (level 1 form, level 2 Rita chat, level 3 phone call)
 * and arrives here already resolved in `contact_options`.
 *
 * The share action lives in THIS row, next to the contact buttons, so every
 * property page shows one single row of primary actions.
 */
export default function PropertyContactActions({
  listingId,
  title,
  dealType,
  options,
  premsg,
  shareUrl,
  compact = false,
  showShare = true,
  shareOnly = false,
  shareButtonClassName,
  className,
  style,
}: {
  listingId: string;
  title: string;
  dealType?: string | null;
  options?: ContactOptions | null;
  premsg?: string | null;
  shareUrl?: string | null;
  compact?: boolean;
  showShare?: boolean;
  shareOnly?: boolean;
  shareButtonClassName?: string;
  className?: string;
  style?: CSSProperties;
  /** Legacy presentation props; all inquiry forms now use the same bottom sheet. */
  formAsButton?: boolean;
  singleRow?: boolean;
}) {
  const settings = options ?? {};
  // Preserve priced identity capture, but avoid a redundant form when a
  // configured conversation can collect it itself.
  const showWhatsapp = !shareOnly && settings.whatsapp === true;
  const showPhone = !shareOnly && settings.phone === true;
  const showDigital = !shareOnly && settings.digital === true;
  const [mode, setMode] = useState<'digital' | 'phone' | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [inquiryStarted, setInquiryStarted] = useState(false);
  const audience = dealType === 'rent' ? 'renter' : dealType === 'sale' ? 'buyer' : null;
  const extraFields = cleanFormFields(settings.form_fields);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const setAnswer = (id: string, value: string | string[]) => setAnswers((a) => ({ ...a, [id]: value }));
  const { user } = useAuth();
  const navigate = useNavigate();
  const [joinOpen, setJoinOpen] = useState(false);
  const [challenge, setChallenge] = useState<InquiryChallenge | null>(null);
  const ref = propertyInquiryRef();

  // Canonical opener built from the property row itself, so Rita can parse the
  // exact property (type, street + house number, city) with zero questions.
  const waMessage = premsg?.trim() || `היי ריטה, אשמח לקבל פרטים אודות ${title}.`;
  // The sharing partner's code travels inside the opener so the WhatsApp
  // contact is credited to them when the message arrives.
  const waOpener = ref && /^[A-Za-z0-9_-]{4,40}$/.test(ref) ? `${waMessage}\n[ref:${ref}]` : waMessage;

  const shareDetails = () => {
    const url = shareUrl?.trim() || (typeof window !== 'undefined' ? window.location.href : '');
    return { url, text: `${title}\n${url}` };
  };

  const share = async (channel: 'whatsapp' | 'sms' | 'email' | 'copy' | 'native') => {
    try {
      const url = user ? await personalPropertyLink(listingId) : shareDetails().url;
      const text = `${title}\n${url}`;
      if (!url) return;
      if (channel === 'native' && navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      if (channel === 'whatsapp') {
        openWhatsAppContactPicker(text);
      } else if (channel === 'sms') {
        openExternal(`sms:?&body=${encodeURIComponent(text)}`);
      } else if (channel === 'email') {
        openExternal(`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`);
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('הקישור הועתק');
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) toast.error('שיתוף הקישור נכשל, נסו שוב');
    }
  };

  // WhatsApp already knows the visitor's number, so skip the form: open the
  // chat at once with a message about this property; Rita asks for the name.
  const openRita = () => {
    setInquiryStarted(true);
    window.open(officialWaLink(waOpener), '_blank', 'width=1200,height=800,noopener,noreferrer');
  };

  const submit = async (verification?: { id: string; answers: Record<string, string> }) => {
    if ((mode !== 'phone' && !name.trim()) || phone.replace(/\D/g, '').length < 9) {
      toast.error(mode === 'phone' ? 'יש למלא מספר טלפון תקין' : 'יש למלא שם מלא ומספר טלפון תקין');
      return;
    }
    const callback = mode === 'phone';
    if (!callback) {
      const missing = extraFields.find((f) => { const v = answers[f.id]; return f.required && (Array.isArray(v) ? v.length === 0 : !String(v ?? '').trim()); });
      if (missing) { toast.error(`יש למלא: ${missing.label}`); return; }
    }
    setSending(true);
    const formAnswers = callback ? undefined : extraFields.map((f) => ({ id: f.id, value: answers[f.id] ?? '' }));
    const { data, error } = await supabase.functions.invoke('public-lead-gate', {
      body: { action: callback ? 'callback' : 'register', listing_id: listingId, name: name.trim(), phone: phone.trim(), intent: callback ? 'phone' : 'digital', ref, form_answers: formAnswers, device_id: inquiryDeviceId(), verification },
    });
    setSending(false);
    const v = (data as { verify?: InquiryChallenge; error?: string } | null);
    if (!error && v?.verify) {
      if (v.error) toast.error(v.error);
      setChallenge(v.verify);
      return;
    }
    setChallenge(null);


    if (error || (data as { error?: string } | null)?.error) {
      let serverMessage = (data as { error?: string } | null)?.error;
      const ctx = (error as { context?: Response } | null)?.context;
      if (!serverMessage && ctx && typeof ctx.json === 'function') {
        try { serverMessage = (await ctx.clone().json())?.error; } catch { /* non-JSON body */ }
      }
      console.error('[PropertyContactActions] lead submission failed', { listingId, action: callback ? 'callback' : 'register', error, serverMessage });
      toast.error(serverMessage || 'שליחת הפרטים נכשלה, אנא נסו שוב');
      return;
    }
    toast.success(callback ? 'תודה, נחזור אליכם טלפונית בהקדם' : 'הפרטים נשלחו בהצלחה');
    setMode(null); setName(''); setPhone(''); setAnswers({});
  };

  return (
    <>
      <div data-property-contact-row onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} style={style} className={cn(shareOnly ? 'inline-flex shrink-0' : 'flex w-full flex-wrap items-center gap-1.5', !compact && !shareOnly && 'sticky bottom-5 right-0 z-10 rounded-md bg-card/95 py-2 backdrop-blur', className)}>
        {!shareOnly && <div data-inquiry-actions className="flex w-full min-w-0 items-center gap-1.5">
          {showDigital && <Button variant="inquiryForm" className="property-inquiry-action" onClick={() => { setMode('digital'); setInquiryStarted(true); }}><ClipboardList /><span>השארת פרטים</span></Button>}
          {showWhatsapp && <Button variant="inquiryWhatsapp" className="property-inquiry-action" onClick={openRita}><WhatsAppIcon /><span>ווטסאפ</span></Button>}
          {showPhone && <Button variant="inquiryPhone" className="property-inquiry-action" onClick={() => { setMode('phone'); setInquiryStarted(true); }}><Phone /><span>שיחת טלפון</span></Button>}
        </div>}
        {showShare && !user && (
          <Button variant="outline" size={compact ? 'icon' : 'default'} className={cn(shareButtonClassName || (compact ? 'h-10 w-10 shrink-0' : 'min-w-[8rem] flex-1'), !shareOnly && 'order-5 sm:order-none')} aria-label="שיתוף נכס" title="שיתוף נכס" onClick={() => setJoinOpen(true)}>
            <Share2 className="h-4 w-4" />{compact ? null : 'שיתוף'}
          </Button>
        )}
        {showShare && user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size={compact ? 'icon' : 'default'} className={cn(shareButtonClassName || (compact ? 'h-10 w-10 shrink-0' : 'min-w-[8rem] flex-1'), !shareOnly && 'order-5 sm:order-none')} aria-label="שיתוף נכס" title="שיתוף נכס">
                <Share2 className="h-4 w-4" />{compact ? null : 'שיתוף'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 text-right">
              <DropdownMenuLabel className="text-xs">שיתוף נכס</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2" onSelect={() => void share('whatsapp')}><MessageCircle className="h-4 w-4" />וואטסאפ</DropdownMenuItem>
              <DropdownMenuItem className="gap-2" onSelect={() => void share('sms')}><Smartphone className="h-4 w-4" />SMS</DropdownMenuItem>
              <DropdownMenuItem className="gap-2" onSelect={() => void share('email')}><Mail className="h-4 w-4" />אימייל</DropdownMenuItem>
              <DropdownMenuItem className="gap-2" onSelect={() => void share('copy')}><Copy className="h-4 w-4" />העתק קישור</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {!shareOnly && inquiryStarted && mode === null && <div className="order-last col-span-2 w-full"><BrokerageCommissionDisclosure audience={audience} /></div>}
      </div>
      <InquiryVerificationDialog challenge={challenge} sending={sending} onClose={() => setChallenge(null)} onSubmit={(verification) => void submit(verification)} />
      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent dir="rtl" aria-describedby={undefined} className="sm:max-w-md" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
          <DialogHeader><DialogTitle className="text-center text-xl">מנגנון העמלות בשיתוף נכסים 💸</DialogTitle></DialogHeader>
          <p className="break-words text-center text-muted-foreground">{title}</p>
          <div className="space-y-2.5 rounded-lg bg-muted/40 p-4 text-base leading-relaxed">
            <p>🔗 משתמשים רשומים משתפים נכסים עם חברים ומתעניינים בלחיצה אחת.</p>
            <p>🏠 כשמתעניין שנרשם דרך הקישור שלך יוצר קשר או סוגר עסקה, השיתוף נזקף לזכותך.</p>
            <p>💰 על כל פעילות שמביא הקישור שלך ניתן לקבל תגמולים ועמלות — בהתאם לתגמולים שהמפרסם הגדיר לנכס.</p>
            <p>✨ ההרשמה חינם ולוקחת פחות מדקה.</p>
          </div>
          <Button
            size="lg"
            className="mt-1 w-full text-base font-bold"
            onClick={() => {
              setJoinOpen(false);
              navigate('/auth', { state: { returnTo: window.location.pathname + window.location.search, tab: 'signup' } });
            }}
          >
            הרשמה חינם והתחלת שיתוף 🚀
          </Button>
        </DialogContent>
      </Dialog>
      <Drawer open={mode !== null} onOpenChange={(open) => !open && setMode(null)} shouldScaleBackground={false}>
        <DrawerContent dir="rtl" aria-describedby={undefined} className="mx-auto max-h-[85dvh] w-[calc(100%-30px)] max-w-lg overflow-y-auto rounded-t-lg" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <DrawerHeader><DrawerTitle className="text-center">{mode === 'phone' ? 'שיחת טלפון' : 'השארת פרטים'}</DrawerTitle></DrawerHeader>
          <div className="px-4 pb-3"><BrokerageCommissionDisclosure audience={audience} /></div>
        {mode === 'digital' && (
          <form id={`property-inquiry-${listingId}`} className="space-y-3 px-4" onFocusCapture={() => setInquiryStarted(true)} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            <div className="min-w-[7rem] flex-1"><Label htmlFor={`name-${listingId}`}>שם מלא <span className="text-destructive">*</span></Label><Input id={`name-${listingId}`} autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} /></div>
            <div className="min-w-[7rem] flex-1"><Label htmlFor={`phone-${listingId}`}>מספר טלפון <span className="text-destructive">*</span></Label><Input id={`phone-${listingId}`} type="tel" dir="ltr" autoComplete="tel" required value={phone} maxLength={11} onChange={(event) => { const d = event.target.value.replace(/\D/g, "").replace(/^972/, "0").slice(0, 10); setPhone(d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d); }} /></div>
            {extraFields.map((f) => {
              const v = answers[f.id];
              const id = `ff-${listingId}-${f.id}`;
              const chip = (label: string, on: boolean, onClick: () => void) => (
                <Button key={label} type="button" variant={on ? 'default' : 'outline'} aria-pressed={on} onClick={onClick} className="px-3 py-1 text-sm">{label}</Button>
              );
              return (
                <div key={f.id} className="w-full space-y-1">
                  <Label htmlFor={id}>{f.label}{f.required && <span className="text-destructive"> *</span>}</Label>
                  {f.type === 'text' && <Input id={id} maxLength={300} value={(v as string) ?? ''} onChange={(e) => setAnswer(f.id, e.target.value)} />}
                  {f.type === 'number' && <Input id={id} inputMode="decimal" value={(v as string) ?? ''} onChange={(e) => setAnswer(f.id, e.target.value.replace(/[^\d.]/g, ''))} />}
                  {f.type === 'date' && <Input id={id} type="date" value={(v as string) ?? ''} onChange={(e) => setAnswer(f.id, e.target.value)} />}
                  {f.type === 'yesno' && <div className="flex gap-2">{['כן', 'לא'].map((o) => chip(o, v === o, () => setAnswer(f.id, o)))}</div>}
                  {f.type === 'single' && <div className="flex flex-wrap gap-2">{(f.options ?? []).map((o) => chip(o, v === o, () => setAnswer(f.id, o)))}</div>}
                  {f.type === 'multi' && <div className="flex flex-wrap gap-2">{(f.options ?? []).map((o) => { const arr = Array.isArray(v) ? v : []; return chip(o, arr.includes(o), () => setAnswer(f.id, arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o])); })}</div>}
                </div>
              );
            })}

          </form>
        )}
          {mode === 'phone' && <div className="space-y-3 px-4"><Label htmlFor={`callback-${listingId}`}>מספר טלפון *</Label><Input id={`callback-${listingId}`} type="tel" dir="ltr" autoComplete="tel" value={phone} maxLength={11} onChange={(event) => { const d = event.target.value.replace(/\D/g, '').replace(/^972/, '0').slice(0, 10); setPhone(d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d); }} /></div>}
          <DrawerFooter>
            <Button variant="outline" disabled={sending} onClick={() => setMode(null)}>ביטול</Button>
            <Button variant="destructive" className={mode === 'phone' ? 'bg-lead-phone text-primary-foreground hover:bg-lead-phone/90' : undefined} type={mode === 'digital' ? 'submit' : 'button'} form={mode === 'digital' ? `property-inquiry-${listingId}` : undefined} disabled={sending || phone.replace(/\D/g, '').length < 9 || (mode === 'digital' && !name.trim())} onClick={mode === 'phone' ? () => void submit() : undefined}>
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}{mode === 'phone' ? 'חייגו אליי' : 'שליחת פרטים'}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
