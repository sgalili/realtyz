import { useState } from 'react';
import { ChevronLeft, Copy, Loader2, Mail, MessageCircle, Phone, Share2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RitaAvatar } from '@/components/RitaAvatar';
import WhatsAppIcon from '@/components/properties/WhatsAppIcon';
import { officialWaLink, openWhatsAppContactPicker } from '@/lib/officialWa';
import { openExternal } from '@/lib/openExternal';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cleanFormFields, type LeadContactOptions } from '@/lib/leadTiers';

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
  options,
  premsg,
  shareUrl,
  compact = false,
  showShare = true,
  shareOnly = false,
  shareButtonClassName,
}: {
  listingId: string;
  title: string;
  options?: ContactOptions | null;
  premsg?: string | null;
  shareUrl?: string | null;
  compact?: boolean;
  showShare?: boolean;
  shareOnly?: boolean;
  shareButtonClassName?: string;
}) {
  const settings = options ?? {};
  // Preserve priced identity capture, but avoid a redundant form when a
  // configured conversation can collect it itself.
  const showWhatsapp = !shareOnly && settings.whatsapp === true;
  const showPhone = !shareOnly && settings.phone === true;
  const showDigital = !shareOnly && settings.digital === true && !showWhatsapp && !showPhone;
  const [mode, setMode] = useState<'digital' | 'phone' | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const extraFields = cleanFormFields(settings.form_fields);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const setAnswer = (id: string, value: string | string[]) => setAnswers((a) => ({ ...a, [id]: value }));
  const { user } = useAuth();
  const [joinOpen, setJoinOpen] = useState(false);
  const ref = new URLSearchParams(window.location.search).get('ref');

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
    const { url, text } = shareDetails();
    if (!url) return;
    try {
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
    } catch {
      /* the visitor cancelled, or the clipboard is blocked */
    }
  };

  // WhatsApp already knows the visitor's number, so skip the form: open the
  // chat at once with a message about this property; Rita asks for the name.
  const openRita = () => {
    window.open(officialWaLink(waOpener), '_blank', 'width=1200,height=800,noopener,noreferrer');
  };

  const submit = async () => {
    if ((!mode && !name.trim()) || phone.replace(/\D/g, '').length < 9) {
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
      body: { action: callback ? 'callback' : 'register', listing_id: listingId, name: name.trim(), phone: phone.trim(), intent: callback ? 'phone' : 'digital', ref, form_answers: formAnswers },
    });
    setSending(false);

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
      <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} className={shareOnly ? 'inline-flex shrink-0' : compact ? 'flex w-full flex-wrap items-center gap-2' : 'sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-card/95 p-2 shadow-lg backdrop-blur'}>
        {showDigital && (
          <form className="flex w-full flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            <div className="min-w-[7rem] flex-1"><Label htmlFor={`name-${listingId}`}>שם מלא <span className="text-destructive">*</span></Label><Input id={`name-${listingId}`} autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} /></div>
            <div className="min-w-[7rem] flex-1"><Label htmlFor={`phone-${listingId}`}>מספר טלפון <span className="text-destructive">*</span></Label><Input id={`phone-${listingId}`} type="tel" dir="ltr" autoComplete="tel" required value={phone} maxLength={11} onChange={(event) => { const d = event.target.value.replace(/\D/g, "").replace(/^972/, "0").slice(0, 10); setPhone(d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d); }} /></div>
            {extraFields.map((f) => {
              const v = answers[f.id];
              const id = `ff-${listingId}-${f.id}`;
              const chip = (label: string, on: boolean, onClick: () => void) => (
                <button key={label} type="button" onClick={onClick} className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-foreground'}`}>{label}</button>
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
            <Button type="submit" size={extraFields.length ? 'default' : 'icon'} className={extraFields.length ? 'w-full' : undefined} aria-label="שליחת פרטים" disabled={sending || !name.trim() || phone.replace(/\D/g, '').length < 9}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : extraFields.length ? 'שליחת פרטים' : <ChevronLeft className="h-4 w-4" />}</Button>
          </form>
        )}
        {showWhatsapp && (
          <Button className="min-w-[9rem] flex-1 bg-social-whatsapp text-success-foreground hover:bg-social-whatsapp/90 text-base" onClick={openRita}>
            <>
              {/* RTL: Rita's picture sits before the label, WA logo on the opposite (left) side. */}
              <RitaAvatar className="h-6 w-6 border-0 ring-0" />
              בואו נדבר
              <WhatsAppIcon className="h-5 w-5" />
            </>
          </Button>
        )}
        {showPhone && (
          <Button variant="outline" className="min-w-[8rem] flex-1 text-base" onClick={() => setMode('phone')}>
            <Phone className="h-4 w-4" />חייגו אליי
          </Button>
        )}
        {showShare && !user && (
          <Button variant="outline" size={compact ? 'icon' : 'default'} className={shareButtonClassName || (compact ? 'h-10 w-10 shrink-0' : 'min-w-[8rem] flex-1')} aria-label="שיתוף נכס" title="שיתוף נכס" onClick={() => setJoinOpen(true)}>
            <Share2 className="h-4 w-4" />{compact ? null : 'שיתוף'}
          </Button>
        )}
        {showShare && user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size={compact ? 'icon' : 'default'} className={shareButtonClassName || (compact ? 'h-10 w-10 shrink-0' : 'min-w-[8rem] flex-1')} aria-label="שיתוף נכס" title="שיתוף נכס">
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
              {typeof navigator !== 'undefined' && navigator.share ? (
                <DropdownMenuItem onSelect={() => void share('native')}>אפשרויות נוספות</DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-right">שתפו נכסים והרוויחו</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm text-foreground">
            <p>הצטרפו בחינם לרשת השותפים של Realtyz ותקבלו תגמול על כל פנייה איכותית שמגיעה דרך הקישור שלכם.</p>
            <ol className="list-decimal space-y-1.5 ps-5">
              <li>נרשמים בחינם בדקה אחת.</li>
              <li>משתפים את הנכס עם קישור אישי בווטסאפ, SMS, מייל או ברשתות.</li>
              <li>ריטה מטפלת בפניות, מסננת ומעבירה למפרסם באופן אוטומטי.</li>
              <li>על כל פנייה שעומדת בתנאים, התגמול נכנס לחשבון שלכם.</li>
            </ol>
          </div>
          <DialogFooter className="flex-row items-center justify-between sm:justify-between">
            <Button variant="outline" onClick={() => setJoinOpen(false)}>ביטול</Button>
            <Button onClick={() => { const next = `/affiliate-network?q=${encodeURIComponent(title)}`; window.location.assign(`/affiliates?next=${encodeURIComponent(next)}`); }}>הצטרפות ושיתוף הנכס</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-right">חזרה טלפונית</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>טלפון *</Label><Input inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
          </div>
          <DialogFooter className="flex-row items-center justify-between sm:justify-between"><Button variant="outline" onClick={() => setMode(null)}>ביטול</Button><Button disabled={sending} onClick={() => void submit()}>{sending && <Loader2 className="h-4 w-4 animate-spin" />}חייגו אליי</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
