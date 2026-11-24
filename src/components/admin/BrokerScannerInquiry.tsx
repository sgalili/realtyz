import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { scannerCall } from './BrokerScannerPanel';
import { formatCountdown, scannerBlockReason, scannerEta } from '@/lib/brokerScannerState';
export const scannerLabels: Record<string, string> = { pending_source: 'ממתין לקריאת המודעה', reading_source: 'קורא את המודעה', ready: 'ממתין בתור לשליחה', sending: 'שולח פנייה', awaiting_reply: 'ממתין לתשובת יד2', completed: 'המספר נשמר', needs_manual: 'נדרשת בדיקה ידנית', cancelled: 'בוטל', failed: 'נכשל' };
const live = ['pending_source','reading_source','ready','sending','awaiting_reply'];

/** Status-only: the magnifying-glass discovery queues scanner inquiries. Hidden once a personal number is saved. */
export function BrokerScannerInquiry({ brokerId, hasWhatsApp }: { brokerId: string; name?: string; hasWhatsApp: boolean }) {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['broker-wa-scanner-job', brokerId], retry: false, enabled: !hasWhatsApp, queryFn: () => scannerCall({ action: 'status', broker_id: brokerId }),
    refetchInterval: q => live.includes(q.state.data?.job?.status ?? '') ? 15000 : false });
  const job = status.data?.job;
  // A correlated reply saved the number: refresh the card so it switches to the invitation button.
  useEffect(() => { if (job?.status === 'completed' || status.data?.contact) void qc.invalidateQueries({ queryKey: ['broker-whatsapp-job', brokerId] }); }, [job?.status, status.data?.contact, brokerId, qc]);
  const [now, setNow] = useState(Date.now());
  const queued = ['pending_source', 'reading_source', 'ready'].includes(job?.status ?? '');
  useEffect(() => { if (!queued) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [queued]);
  if (hasWhatsApp || status.data?.contact || !job) return null;
  // Before the worker reads the ad, say why it is not moving (paused line or disconnected worker) instead of an endless wait.
  const blocked = ['pending_source', 'ready'].includes(job.status) && status.data?.settings ? scannerBlockReason(status.data.settings) : null;
  return <span className="text-xs text-muted-foreground" title={job.last_error ?? undefined}>{scannerLabels[job.status] ?? job.status}{blocked && <span className="text-destructive"> · {blocked}</span>}{queued && !blocked && status.data?.settings && (() => {
    const s = status.data.settings;
    const left = scannerEta({ ...s, used_today: status.data.used_today ?? 0, queue_ahead: status.data.queue_ahead ?? 0 }, now) - now;
    // An open inquiry awaiting Yad2's reply also holds the serial line; the estimate starts once it settles.
    return left > 1000 || status.data.outstanding ? <span dir="ltr" className="ms-1 tabular-nums" aria-label="זמן משוער עד השליחה"> · {formatCountdown(left)}{status.data.outstanding ? '+' : ''}</span> : null;
  })()}</span>;
}
