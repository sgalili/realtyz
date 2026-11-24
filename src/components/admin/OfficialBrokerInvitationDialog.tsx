import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { personalBrokerLink, renderBrokerInvitation } from '@/lib/brokerInvitation';
import { brokerTemplateFor, BROKER_STAGE_LABELS, type BrokerOnboardingStatus } from '@/lib/brokerOnboarding';
import { getOfficialWaNumber } from '@/lib/officialWa';
import { useCampaignPricing } from '@/hooks/useCampaignPricing';
import { agorotToCredits } from '@/lib/credits';
import { publicUrl } from '@/lib/publicUrl';
import { brokerWhatsAppRequest } from '@/lib/brokerWhatsAppRequest';

async function invoke(body: Record<string, unknown>) {
  return brokerWhatsAppRequest('admin-broker-invitation', body);
}

function useBrokerWhatsAppEligibility(brokerId: string) {
  return useQuery({
    queryKey: ['broker-whatsapp-invitation-eligibility', brokerId],
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      const data = await invoke({ action: 'whatsapp_eligibility', broker_id: brokerId });
      return data?.eligible === true;
    },
  });
}

/** WhatsApp invitation content, usable inside any dialog or tab. */
export function OfficialBrokerInvitationPanel({ broker, onClose, onSent, attachmentId, useDiscoveredWhatsApp = false }: { broker: { id: string; full_name?: string | null; recipient_name?: string | null }; onClose: () => void; onSent?: () => void; attachmentId?: string | null; useDiscoveredWhatsApp?: boolean }) {
  const open = true;
  const [consent, setConsent] = useState(false);
  const [demo, setDemo] = useState(!useDiscoveredWhatsApp);
  const [feedback, setFeedback] = useState('');
  const requestId = useRef(crypto.randomUUID());
  const qc = useQueryClient();
  const validation = '';
  const whatsappEligibility = useBrokerWhatsAppEligibility(broker.id);
  const hasSavedWhatsApp = whatsappEligibility.data === true;
  // Fixed wording only; the server picks the variant from the recipient's saved gender.
  const state = useQuery({ queryKey: ['official-broker-template', broker.id], enabled: open, retry: false, staleTime: 0, queryFn: () => invoke({ action: 'status', broker_id: broker.id }) });
  const text: string = state.data?.text ?? brokerTemplateFor(null);
  const demoLink: string = state.data?.demo_link ?? publicUrl('/demo');
  const previewLink = demo ? demoLink : personalBrokerLink(broker.id);
  const pricing = useCampaignPricing(open);
  const waPrice = pricing.data?.find(p => p.action_key === 'whatsapp_marketing');
  const onboarding = useQuery({ queryKey: ['broker-onboarding', broker.id], enabled: open, queryFn: async () => {
    const { data, error } = await supabase.rpc('broker_onboarding_status', { _broker: broker.id });
    if (error) throw error;
    return data as BrokerOnboardingStatus | null;
  } });
  const sender = useQuery({ queryKey: ['official-wa-number'], enabled: open, queryFn: getOfficialWaNumber });
  const mutation = useMutation({ mutationFn: (action: 'send') => invoke({ action, broker_id: broker.id, ...(action === 'send' ? { request_id: requestId.current, consent, demo, attachment_id: attachmentId ?? null, use_discovered_whatsapp: useDiscoveredWhatsApp } : {}) }), onSuccess: async (d: { attachment_status?: string } | null) => {
    setFeedback(`Meta קיבלה את ההזמנה. מסירה לנמען טרם אומתה.${d?.attachment_status === 'failed' ? ' הקובץ המצורף לא נשלח: Meta מאפשרת קובץ רק בשיחה פתוחה מ-24 השעות האחרונות.' : d?.attachment_status === 'sent' ? ' הקובץ המצורף נשלח.' : ''}`); onSent?.(); await qc.invalidateQueries({ queryKey: ['broker-onboarding'] });
    await qc.invalidateQueries({ queryKey: ['broker-contact-history'] });
  }, onError: e => setFeedback(e.message) });
  const registration = useMutation({ mutationFn: () => invoke({ action: 'register', broker_id: broker.id }), onSuccess: () => { void state.refetch(); }, onError: (error: Error) => setFeedback(error.message) });
  const status = state.data?.status;
  const labels: Record<string, string> = { NOT_REGISTERED: 'הנוסח טרם הוגש ל-Meta', PENDING: 'ממתין לאישור Meta', APPROVED: 'תבנית מאושרת', REJECTED: 'Meta דחתה את התבנית', PAUSED: 'התבנית מושהית', DISABLED: 'התבנית אינה פעילה' };
  return <div className="space-y-3">
      <p className="text-sm text-muted-foreground">נשלח בתבנית Meta מאושרת מהמספר הרשמי {sender.data ? `+${sender.data}` : ''}.</p>
      {onboarding.data && <p role="status" className="text-sm text-primary">{BROKER_STAGE_LABELS[onboarding.data.stage]}{onboarding.data.pending_properties > 0 ? ` · ${onboarding.data.pending_properties} נכסים לבדיקה` : ''}</p>}
      {onboarding.isError && <p role="alert" className="text-destructive">לא ניתן לקרוא את שלב ההצטרפות</p>}
      <Label>תצוגת ההודעה לנמען</Label>
      <p className="whitespace-pre-wrap break-words border-s-2 border-border ps-3 text-sm leading-6">{renderBrokerInvitation(text, { brokerName: (broker.recipient_name || broker.full_name || '').trim().split(/\s+/)[0] || 'מתווך', authLink: previewLink }).split(previewLink).map((part, index, parts) => <span key={index}>{part}{index < parts.length - 1 && <a href={previewLink} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">{previewLink}</a>}</span>)}</p>
      <div className="flex justify-between items-center gap-2"><span role="status" className="text-sm text-muted-foreground">{state.isFetching ? 'בודק אישור Meta…' : state.isError ? 'בדיקת Meta נכשלה' : labels[status] || status}</span><Button size="icon" variant="ghost" aria-label="רענון אישור Meta" disabled={state.isFetching || !!validation || mutation.isPending} onClick={() => void state.refetch()}><RefreshCw className="h-4 w-4" /></Button></div>
      <p role="note" className="text-sm font-medium">עלות שליחה לנמען חדש ללא היסטוריה: {waPrice ? `${agorotToCredits(waPrice.price_agorot).toLocaleString('he-IL')} קרדיטים להודעה` : pricing.isLoading ? 'טוען…' : 'לא הוגדרה'}</p>
      {state.error && <p role="alert" className="break-words text-sm text-destructive">{state.error.message}</p>}
      <div className="space-y-1"><Label className="flex items-start gap-2 leading-6"><Checkbox checked={demo} disabled={mutation.isPending} onCheckedChange={v => setDemo(v === true)} />שליחת קישור לחשבון דמו לצפייה בלבד</Label>{demo && <p className="text-sm text-muted-foreground">הדמו יותאם לסוג המשתמש, או שייפתח עמוד בחירה אם הסוג אינו ידוע. אין צורך בקוד אימות.</p>}</div>
      <Label className="flex items-start gap-2 leading-6"><Checkbox checked={consent} disabled={mutation.isPending} onCheckedChange={v => setConsent(v === true)} />הנמען הסכים לקבל הזמנה ב־WhatsApp</Label>
      {!whatsappEligibility.isLoading && !hasSavedWhatsApp && <p role="alert" className="text-sm text-destructive">שליחת הזמנה ב־WhatsApp אפשרית רק לאחר שמירת מספר וואטסאפ אישי. לא נעשה שימוש בטלפון איש הקשר או בטלפון הכניסה.</p>}
      {feedback && <p role="status" className="break-words text-sm">{feedback}</p>}
      <div className="flex flex-row justify-between gap-2"><Button variant="outline" disabled={mutation.isPending || registration.isPending} onClick={onClose}>ביטול</Button>{status === 'APPROVED' ? <Button disabled={!consent || !hasSavedWhatsApp || whatsappEligibility.isFetching || !!validation || state.isFetching || mutation.isPending || !onboarding.data || !!feedback} onClick={() => mutation.mutate('send')}><Send className="h-4 w-4" />{mutation.isPending ? 'שולח…' : 'שליחת הזמנה'}</Button> : status === 'NOT_REGISTERED' ? <Button disabled={registration.isPending || state.isFetching} onClick={() => registration.mutate()}>הגשת הנוסח לאישור Meta</Button> : <span className="text-sm text-muted-foreground">השליחה תתאפשר לאחר אישור התבנית</span>}</div>
    </div>;
}

export function OfficialBrokerInvitationDialog({ broker, triggerLabel, triggerClassName }: { broker: { id: string; full_name?: string | null }; triggerLabel?: string; triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const qc = useQueryClient();
  const whatsappEligibility = useBrokerWhatsAppEligibility(broker.id);
  const hasSavedWhatsApp = whatsappEligibility.data === true;
  // No saved personal WhatsApp: render nothing (no disabled/faded invitation icon).
  if (!hasSavedWhatsApp && !open) return null;
  return <>
    <Button variant={triggerLabel ? 'default' : 'ghost'} size={triggerLabel ? 'default' : 'icon'} className={triggerLabel ? 'h-11 text-base' : triggerClassName ?? 'h-8 w-8'} aria-label="שליחת הזמנה רשמית ב־WhatsApp" title={hasSavedWhatsApp ? 'שליחת הזמנה רשמית ב־WhatsApp' : 'נדרש מספר וואטסאפ אישי שמור; טלפון הכניסה אינו מספיק'} disabled={!hasSavedWhatsApp || whatsappEligibility.isFetching} onClick={() => { setOpen(true); setSent(false); }}><Send className="h-4 w-4 shrink-0" />{triggerLabel}</Button>
    <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value && sent) void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); }}><DialogContent dir="rtl" className="w-[calc(100%-2rem)] max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto text-right">
      <DialogHeader><DialogTitle>הזמנה ב־WhatsApp ל־{broker.full_name || 'מתווך'}</DialogTitle><DialogDescription className="sr-only">שליחה בתבנית Meta מאושרת</DialogDescription></DialogHeader>
      {open && <OfficialBrokerInvitationPanel broker={broker} useDiscoveredWhatsApp onClose={() => setOpen(false)} onSent={() => setSent(true)} />}
    </DialogContent></Dialog>
  </>;
}
