import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { brokerWhatsAppRequest } from '@/lib/brokerWhatsAppRequest';
import { brokerUserError } from '../../../supabase/functions/_shared/brokerRecovery';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { WhatsAppIcon } from '@/components/properties/WhatsAppIcon';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { OfficialBrokerInvitationPanel } from './OfficialBrokerInvitationDialog';
import { BrokerNumberEditor } from './BrokerNumberEditor';
import { BrokerScannerInquiry } from './BrokerScannerInquiry';
import { scannerCall, type ScannerStatus } from './BrokerScannerPanel';
import { discoveryInProgress } from '@/lib/adminImportPresentation';

type Job = { id: string; status: string; last_error: string | null; attempts: number };
const activeStates = ['pending', 'running', 'retry'];
const labels: Record<string, string> = { pending: 'ממתין לגילוי', running: 'מאתר מספר WhatsApp', retry: 'ממתין לניסיון נוסף', completed: 'המשימה הושלמה', not_found: 'לא נמצא קישור WhatsApp חד־משמעי במודעה', failed: 'הגילוי נכשל' };
async function invoke(body: Record<string, unknown>): Promise<{ job: Job | null; contact?: { whatsapp_phone: string } | null }> {
  return brokerWhatsAppRequest('broker-whatsapp-worker', body);
}

/** Admin-only contact source: never mount on a public or peer broker profile. */
export function BrokerWhatsAppContact({ brokerId, name, phone, statusSlot }: { brokerId: string; name: string; phone?: string | null; statusSlot?: HTMLElement | null }) {
  const qc = useQueryClient();
  const [tracking, setTracking] = useState(() => activeStates.includes(qc.getQueryData<{job:Job|null}>(['broker-whatsapp-job',brokerId])?.job?.status??''));
  const starting = useRef(false);
  const currentBroker = useRef(brokerId);
  currentBroker.current = brokerId;
  const [sendOpen, setSendOpen] = useState(false);
  const status = useQuery({ queryKey: ['broker-whatsapp-job', brokerId], retry: false, queryFn: () => invoke({ action: 'status', broker_id: brokerId }), refetchInterval: query => query.state.error || activeStates.includes(query.state.data?.job?.status ?? '') ? 4000 : false });
  const job = status.data?.job;
  // Inquiry component owns polling; subscribing to the same key keeps the action locked through both queues.
  const scanner = useQuery<ScannerStatus>({ queryKey: ['broker-wa-scanner-job', brokerId], enabled: false, queryFn: () => scannerCall({ action: 'status', broker_id: brokerId }) });
  // Read the persisted contact even when completion happened while this card was unmounted.
  const savedPhone = status.data?.contact !== undefined ? status.data.contact?.whatsapp_phone : phone;
  const enqueue = useMutation({ mutationFn: (target: string) => invoke({ action: 'enqueue', broker_id: target }),
    onSuccess: (data, target) => { if(currentBroker.current!==target)return; qc.setQueryData<{ job: Job | null; contact?: { whatsapp_phone: string } | null }>(['broker-whatsapp-job', target], previous => ({ ...previous, ...data })); setTracking(true); },
    onError: (e: Error, target) => { if(currentBroker.current!==target)return; starting.current=false;setTracking(false);toast.error(e.message); } });
  useEffect(() => { setTracking(activeStates.includes(qc.getQueryData<{job:Job|null}>(['broker-whatsapp-job',brokerId])?.job?.status??'')); starting.current=false;setSendOpen(false); }, [brokerId,qc]);
  useEffect(() => {
    if (!tracking) { if(!status.error && job && activeStates.includes(job.status))setTracking(true); return; }
    // A failed background read is not a failed discovery. Retain its last known state and poll again.
    if (status.error) return;
    if(!job&&status.data&&!status.isLoading&&!enqueue.isPending){starting.current=false;setTracking(false);return;}
    if (job && !activeStates.includes(job.status)) {
      starting.current=false;setTracking(false);
      if (job.status === 'completed') {
        void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] });
        void qc.invalidateQueries({ queryKey: ['broker-whatsapp-invitation-eligibility', brokerId] });
      }
      else if(job.status==='failed' && job.last_error!=='user_cancelled')toast.error(job.last_error === 'whatsapp_contact_changed_requires_review' ? 'המספר במקור שונה ממספר WhatsApp השמור. המספר השמור לא שונה; נדרשת בדיקה ידנית.' : brokerUserError(job.last_error, labels.failed));
      else if(job.status==='not_found') void qc.invalidateQueries({ queryKey: ['broker-wa-scanner-job', brokerId] });
    }
  }, [job?.status, tracking, status.error, brokerId, qc]);
  const busy = enqueue.isPending || discoveryInProgress(job?.status, scanner.data?.job?.status) || (tracking && status.isLoading);
  return <span className="inline-flex min-w-0 max-w-full items-center gap-0">
    {(!busy || savedPhone) && <BrokerNumberEditor brokerId={brokerId} name={name} phone={savedPhone} kind="whatsapp" />}
    {savedPhone && <>
      <Button variant="ghost" size="icon" className="-ms-1 h-8 w-7 shrink-0 text-lead-whatsapp" aria-label={`WhatsApp רשמי אל ${name}`} title={`שליחה רשמית אל ${formatPhoneDisplay(savedPhone)}`} onClick={() => setSendOpen(true)}><WhatsAppIcon className="h-4 w-4" /></Button>
    </>}
    {!savedPhone && !busy && <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-lead-whatsapp" aria-label={`גילוי WhatsApp של ${name}`} title="גילוי WhatsApp במודעת יד2" onClick={() => { if(starting.current||busy)return;starting.current=true;enqueue.mutate(brokerId); }}><Search className="h-4 w-4" /></Button>}
    <BrokerScannerInquiry brokerId={brokerId} name={name} hasWhatsApp={!!savedPhone} lookupStatus={busy ? job?.status ?? 'pending' : undefined} lookupError={job?.last_error} statusSlot={statusSlot} />
    <Dialog open={sendOpen} onOpenChange={setSendOpen}><DialogContent dir="rtl" className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto text-right"><DialogHeader><DialogTitle>הזמנה ב־WhatsApp ל־{name}</DialogTitle><DialogDescription>מספר וואטסאפ: <span dir="ltr">{savedPhone ? formatPhoneDisplay(savedPhone) : ''}</span></DialogDescription></DialogHeader>
      {sendOpen && <OfficialBrokerInvitationPanel broker={{ id: brokerId, full_name: name }} useDiscoveredWhatsApp onClose={() => setSendOpen(false)} />}
    </DialogContent></Dialog>
  </span>;
}