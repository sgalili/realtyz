import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Send, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { brokerInvitation, renderBrokerInvitation } from '@/lib/brokerInvitation';
import { BROKER_TEMPLATE_BODY, templateBody, BROKER_STAGE_LABELS, type BrokerOnboardingStatus } from '@/lib/brokerOnboarding';
import { getOfficialWaNumber } from '@/lib/officialWa';
import { toast } from 'sonner';

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-broker-invitation', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const details = await error.context.json().catch(() => null);
      throw new Error(typeof details?.error === 'string' ? details.error : 'בדיקת ההזמנה נכשלה');
    }
    throw error;
  }
  return data;
}

export function OfficialBrokerInvitationDialog({ broker }: { broker: { id: string; full_name?: string | null } }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(BROKER_TEMPLATE_BODY);
  const [consent, setConsent] = useState(false);
  const [feedback, setFeedback] = useState('');
  const requestId = useRef(crypto.randomUUID());
  const qc = useQueryClient();
  let validation = '';
  try { templateBody(text); } catch (e) { validation = e instanceof Error ? e.message : 'נוסח לא תקין'; }
  const state = useQuery({ queryKey: ['official-broker-template', text], enabled: open && !validation, retry: false, staleTime: 0, queryFn: () => invoke({ action: 'status', text }) });
  const onboarding = useQuery({ queryKey: ['broker-onboarding', broker.id], enabled: open, queryFn: async () => {
    const { data, error } = await supabase.rpc('broker_onboarding_status', { _broker: broker.id });
    if (error) throw error;
    return data as BrokerOnboardingStatus | null;
  } });
  const sender = useQuery({ queryKey: ['official-wa-number'], enabled: open, queryFn: getOfficialWaNumber });
  const mutation = useMutation({ mutationFn: (action: 'register' | 'send') => invoke({ action, text, ...(action === 'send' ? { broker_id: broker.id, request_id: requestId.current, consent } : {}) }), onSuccess: async (data, action) => {
    if (action === 'send') { setFeedback('Meta קיבלה את ההזמנה. מסירה לנמען טרם אומתה.'); await qc.invalidateQueries({ queryKey: ['broker-onboarding'] }); }
    else { toast.success('התבנית הוגשה ל-Meta'); await state.refetch(); }
  }, onError: e => setFeedback(e.message) });
  const status = state.data?.status;
  const labels: Record<string, string> = { NOT_REGISTERED: 'הנוסח טרם הוגש ל-Meta', PENDING: 'ממתין לאישור Meta', APPROVED: 'תבנית מאושרת', REJECTED: 'Meta דחתה את התבנית', PAUSED: 'התבנית מושהית', DISABLED: 'התבנית אינה פעילה' };
  return <>
    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="שליחת הזמנה רשמית ב־WhatsApp" title="שליחת הזמנה רשמית ב־WhatsApp" onClick={() => { setOpen(true); setText(BROKER_TEMPLATE_BODY); setConsent(false); setFeedback(''); requestId.current = crypto.randomUUID(); }}><Send className="h-4 w-4 shrink-0" /></Button>
    <Dialog open={open} onOpenChange={value => { if (!mutation.isPending) setOpen(value); }}><DialogContent dir="rtl" className="w-[calc(100%-2rem)] max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto text-right">
      <DialogHeader><DialogTitle>הזמנה רשמית ל־{broker.full_name || 'מתווך'}</DialogTitle><DialogDescription>שליחה ממספר WhatsApp Business הרשמי {sender.data ? `+${sender.data}` : ''}. שינוי בנוסח מחייב אישור Meta מחדש; הודעת הזמנה עשויה להיות בתשלום.</DialogDescription></DialogHeader>
      {onboarding.data && <p role="status" className="text-sm text-primary">{BROKER_STAGE_LABELS[onboarding.data.stage]}{onboarding.data.pending_properties > 0 ? ` · ${onboarding.data.pending_properties} נכסים לבדיקה` : ''}</p>}
      {onboarding.isError && <p role="alert" className="text-destructive">לא ניתן לקרוא את שלב ההצטרפות</p>}
      <Label htmlFor={`invitation-${broker.id}`}>נוסח לעריכה</Label>
      <Textarea id={`invitation-${broker.id}`} value={text} disabled={mutation.isPending || !!feedback.startsWith('Meta קיבלה')} maxLength={1024} rows={8} className="leading-6" onChange={e => { setText(e.target.value); setFeedback(''); }} />
      {validation && <p role="alert" className="text-sm text-destructive">{validation}</p>}
      <Label>תצוגת ההודעה לנמען</Label>
      <p className="whitespace-pre-wrap break-words border-s-2 border-border ps-3 text-sm leading-6">{renderBrokerInvitation(text, { brokerName: broker.full_name || 'מתווך', authLink: brokerInvitation(broker).link })}</p>
      <div className="flex justify-between items-center gap-2"><span role="status" className="text-sm text-muted-foreground">{state.isFetching ? 'בודק אישור Meta…' : state.isError ? 'בדיקת Meta נכשלה' : labels[status] || status}</span><Button size="icon" variant="ghost" aria-label="רענון אישור Meta" disabled={state.isFetching || !!validation || mutation.isPending} onClick={() => void state.refetch()}><RefreshCw className="h-4 w-4" /></Button></div>
      {state.error && <p role="alert" className="break-words text-sm text-destructive">{state.error.message}</p>}
      <Label className="flex items-start gap-2 leading-6"><Checkbox checked={consent} disabled={mutation.isPending} onCheckedChange={v => setConsent(v === true)} />הנמען הסכים לקבל הזמנה ב־WhatsApp</Label>
      {feedback && <p role="status" className="break-words text-sm">{feedback}</p>}
      <DialogFooter className="flex-row justify-between gap-2 sm:justify-between"><Button variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}>ביטול</Button>{status === 'APPROVED' ? <Button disabled={!consent || !!validation || state.isFetching || mutation.isPending || !onboarding.data || !!feedback} onClick={() => mutation.mutate('send')}><Send className="h-4 w-4" />{mutation.isPending ? 'שולח…' : 'שליחת הזמנה'}</Button> : <Button disabled={!!validation || mutation.isPending || state.isFetching || state.isError || status !== 'NOT_REGISTERED'} onClick={() => mutation.mutate('register')}>{mutation.isPending ? 'מגיש…' : 'הגשת הנוסח לאישור Meta'}</Button>}</DialogFooter>
    </DialogContent></Dialog>
  </>;
}