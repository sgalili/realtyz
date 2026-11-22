import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { WhatsAppIcon } from '@/components/properties/WhatsAppIcon';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { OfficialBrokerInvitationPanel } from './OfficialBrokerInvitationDialog';

type Job = { id: string; status: string; last_error: string | null; attempts: number };
const activeStates = ['pending', 'running', 'retry', 'discovered', 'sending'];
const labels: Record<string, string> = { pending: 'ממתין לגילוי', running: 'מאתר מספר WhatsApp', retry: 'ממתין לניסיון נוסף', discovered: 'המספר נשמר · ממתין לפנייה', sending: 'שולח דרך Meta', completed: 'המשימה הושלמה', not_found: 'לא נמצא קישור WhatsApp חד־משמעי במודעה', failed: 'הגילוי נכשל', unknown: 'מצב השליחה אינו ודאי · נדרשת בדיקה לפני ניסיון נוסף' };
async function invoke(body: Record<string, unknown>): Promise<{ job: Job | null }> {
  const { data, error } = await supabase.functions.invoke('broker-whatsapp-worker', { body });
  if (error) {
    const details = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(details?.error ?? error.message);
  }
  return data;
}

/** Admin-only contact source: never mount on a public or peer broker profile. */
export function BrokerWhatsAppContact({ brokerId, name, phone }: { brokerId: string; name: string; phone?: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const status = useQuery({ queryKey: ['broker-whatsapp-job', brokerId], enabled: open, retry: false, queryFn: () => invoke({ action: 'status', broker_id: brokerId }), refetchInterval: query => activeStates.includes(query.state.data?.job?.status ?? '') ? 4000 : false });
  const job = status.data?.job;
  const enqueue = useMutation({ mutationFn: () => invoke({ action: 'enqueue', broker_id: brokerId, outreach: consent, ...(consent ? { consent: true } : {}) }),
    onSuccess: async () => { toast.success('המשימה נוספה לתור הגילוי'); await status.refetch(); }, onError: (e: Error) => toast.error(e.message) });
  useEffect(() => {
    if (job && ['completed', 'discovered'].includes(job.status)) void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] });
  }, [job?.status, brokerId, qc]);
  const busy = enqueue.isPending || activeStates.includes(job?.status ?? '') || job?.status === 'unknown';
  return <span className="inline-flex max-w-full flex-wrap items-center gap-0.5">
    {phone && <>
      <span dir="ltr" className="whitespace-nowrap text-xs text-muted-foreground sm:text-sm">{formatPhoneDisplay(phone)}</span>
      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-lead-whatsapp" aria-label={`WhatsApp רשמי אל ${name}`} title={`שליחה רשמית אל ${formatPhoneDisplay(phone)}`} onClick={() => setSendOpen(true)}><WhatsAppIcon className="h-4 w-4" /></Button>
    </>}
    <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-lead-whatsapp" aria-label={`גילוי WhatsApp של ${name}`} title="גילוי WhatsApp במודעת יד2" onClick={() => { setConsent(false); setOpen(true); }}><Search className="h-4 w-4" /></Button>
    <Dialog open={open} onOpenChange={value => { if (!enqueue.isPending) setOpen(value); }}><DialogContent dir="rtl" className="max-w-md text-right">
      <DialogHeader><DialogTitle>WhatsApp של {name}</DialogTitle><DialogDescription>איתור במודעה השמורה של המתווך, ללא שינוי טלפון החשבון.</DialogDescription></DialogHeader>
      {phone && <p dir="ltr" className="text-right text-base">{formatPhoneDisplay(phone)}</p>}
      {status.isLoading && <Loader2 aria-label="טוען מצב משימה" className="h-5 w-5 animate-spin" />}
      {status.error && <p role="alert" className="text-destructive">{status.error.message}</p>}
      {job && <p role="status" className="flex items-center gap-2 text-sm">{activeStates.includes(job.status) && <Loader2 className="h-4 w-4 animate-spin" />}{labels[job.status] ?? job.status}</p>}
      {job?.last_error && <p role="alert" className="break-words text-sm text-destructive">{job.last_error}</p>}
      <label className="flex items-start gap-2 text-base"><Checkbox checked={consent} disabled={busy} onCheckedChange={v => setConsent(v === true)} />הנמען הסכים לקבל את תבנית ההזמנה הרשמית לאחר גילוי המספר</label>
      <DialogFooter className="flex-row justify-between gap-2 sm:justify-between"><Button variant="outline" disabled={enqueue.isPending} onClick={() => setOpen(false)}>ביטול</Button><Button disabled={busy || status.isLoading || status.isError} onClick={() => enqueue.mutate()}>{enqueue.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{consent ? 'גילוי ופנייה מאושרת' : 'גילוי בלבד'}</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={sendOpen} onOpenChange={setSendOpen}><DialogContent dir="rtl" className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto text-right"><DialogHeader><DialogTitle>WhatsApp ל־{name}</DialogTitle><DialogDescription><span dir="ltr">{phone ? formatPhoneDisplay(phone) : ''}</span></DialogDescription></DialogHeader>
      {sendOpen && <OfficialBrokerInvitationPanel broker={{ id: brokerId, full_name: name }} useDiscoveredWhatsApp onClose={() => setSendOpen(false)} />}
    </DialogContent></Dialog>
  </span>;
}