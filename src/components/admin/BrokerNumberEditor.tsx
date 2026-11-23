import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Loader2, Search, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { formatPhoneDisplay } from '@/lib/formatPhone';

type Job = { id: string; status: string; discovered_phone?: string | null; last_error?: string | null };
async function call(fn: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    const detail = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(detail?.error ?? error.message);
  }
  return data as { job?: Job | null; phone?: string; contact?: { whatsapp_phone: string } | null };
}

/** Telephone discovery only suggests a value; the existing authorized save confirms any login change. */
export function BrokerNumberEditor({ brokerId, name, phone, kind }: { brokerId: string; name: string; phone?: string | null; kind: 'phone' | 'whatsapp' }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [tracking, setTracking] = useState(false);
  const processed = useRef<string | null>(null);
  const label = kind === 'phone' ? 'טלפון' : 'וואטסאפ';
  const status = useQuery({ queryKey: ['broker-whatsapp-job', brokerId], enabled: open && tracking, retry: false,
    queryFn: () => call('broker-whatsapp-worker', { action: 'status', broker_id: brokerId }),
    refetchInterval: query => ['pending', 'running', 'retry'].includes(query.state.data?.job?.status ?? '') ? 4000 : false });
  const job = status.data?.job;
  const discover = useMutation({ mutationFn: () => call('broker-whatsapp-worker', { action: 'enqueue', broker_id: brokerId }),
    onSuccess: data => { processed.current = null; qc.setQueryData<{ job?: Job | null; contact?: { whatsapp_phone: string } | null }>(['broker-whatsapp-job', brokerId], previous => ({ ...previous, ...data })); setTracking(true); },
    onError: (error: Error) => toast.error(error.message) });
  const save = useMutation({ mutationFn: () => kind === 'phone'
    ? call('admin-broker-contact', { action: 'save', user_id: brokerId, phone: value.trim() })
    : call('broker-whatsapp-worker', { action: 'save_contact', broker_id: brokerId, phone: value.trim() }),
    onSuccess: data => {
      const savedPhone = data.phone;
      if (kind === 'whatsapp' && savedPhone) {
        qc.setQueryData<{ job?: Job | null; contact?: { whatsapp_phone: string } | null }>(['broker-whatsapp-job', brokerId], previous => ({ ...previous, contact: { whatsapp_phone: savedPhone } }));
        void qc.invalidateQueries({ queryKey: ['broker-whatsapp-invitation-eligibility', brokerId] });
      } else if (kind === 'whatsapp') {
        // Cleared: switch the card back to discovery immediately.
        qc.setQueryData<{ job?: Job | null; contact?: { whatsapp_phone: string } | null }>(['broker-whatsapp-job', brokerId], previous => ({ ...previous, contact: null }));
      }
      if (kind === 'whatsapp') void qc.invalidateQueries({ queryKey: ['broker-wa-scanner-job', brokerId] });
      toast.success('המספר נשמר'); setOpen(false); void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); void qc.invalidateQueries({ queryKey: ['broker-whatsapp-job', brokerId] });
    },
    onError: (error: Error) => toast.error(error.message) });
  useEffect(() => {
    if (!tracking || !job || ['pending', 'running', 'retry'].includes(job.status) || processed.current === job.id) return;
    processed.current = job.id;
    setTracking(false);
    if (kind === 'phone' && job.discovered_phone) setValue(formatPhoneDisplay(job.discovered_phone));
    else if (kind === 'whatsapp' && job.status === 'completed') { setOpen(false); void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); void qc.invalidateQueries({ queryKey: ['broker-whatsapp-invitation-eligibility', brokerId] }); }
    else toast.info(job.last_error === 'worker_not_connected_no_progress_180s' ? 'העובד לא התקדם במשך שלוש דקות. המשימה שוחררה; יש לבדוק את שירות Railway.' : 'לא נמצא מספר חד־משמעי במודעה');
  }, [tracking, job, kind, qc]);
  useEffect(() => { if (tracking && status.error) { setTracking(false); toast.error(status.error.message); } }, [tracking, status.error]);
  const busy = discover.isPending || tracking;
  return <>
    <Button variant="ghost" className={`h-8 min-w-0 shrink-0 px-0.5 font-normal ${phone ? 'text-base sm:text-lg' : 'text-xs sm:text-sm'}`} dir={phone ? 'ltr' : 'rtl'} aria-label={`${phone ? 'עריכת' : 'הוספת'} ${label} של ${name}`} onClick={() => { setValue(phone ? formatPhoneDisplay(phone) : ''); setTracking(false); setOpen(true); }}>{phone ? formatPhoneDisplay(phone) : `הוסף ${label}`}</Button>
    <Dialog open={open} onOpenChange={next => { if (!save.isPending) setOpen(next); }}><DialogContent dir="rtl" className="max-w-md text-right">
      <DialogHeader><DialogTitle>{label} של {name}</DialogTitle><DialogDescription>{kind === 'phone' ? 'טלפון הכניסה משתנה רק לאחר שמירה ידנית.' : 'מספר WhatsApp נשמר בנפרד מטלפון הכניסה.'}</DialogDescription></DialogHeader>
      <label className="space-y-2"><span>עריכה ידנית</span><Input aria-label={`עריכה ידנית של ${label}`} dir="ltr" inputMode="tel" value={value} onChange={event => setValue(event.target.value)} placeholder="05X-XXXXXXX" /></label>
      <Button variant="ghost" className="justify-start" disabled={busy} aria-busy={busy} onClick={() => discover.mutate()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}איתור אוטומטי</Button>
      <DialogFooter className="flex-row justify-between sm:justify-between"><Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button><Button disabled={!value.trim() || save.isPending || busy} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}שמירה</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}