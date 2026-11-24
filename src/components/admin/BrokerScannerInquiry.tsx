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
  const ticking = live.includes(job?.status ?? '');
  useEffect(() => { if (!ticking) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [ticking]);
  if (hasWhatsApp || status.data?.contact || !job) return null;
  // Before the worker reads the ad, say why it is not moving (paused line or disconnected worker) instead of an endless wait.
  const blocked = ['pending_source', 'ready'].includes(job.status) && status.data?.settings ? scannerBlockReason(status.data.settings) : null;
  const st = status.data?.settings;
  // Compact: a live timer only; the full status lives in the tooltip so the row never wraps.
  const target = job.status === 'awaiting_reply' ? Date.parse((job as { reply_deadline?: string | null }).reply_deadline ?? '') || 0
    : queued && st ? scannerEta({ ...st, used_today: status.data?.used_today ?? 0, queue_ahead: status.data?.queue_ahead ?? 0 }, now) : 0;
  const tip = `${scannerLabels[job.status] ?? job.status}${blocked ? ` · ${blocked}` : ''}${job.last_error ? ` · ${job.last_error}` : ''}`;
  if (!live.includes(job.status)) return <span className="text-xs text-muted-foreground whitespace-nowrap" title={tip}>{scannerLabels[job.status] ?? job.status}</span>;
  return <span dir="ltr" className={`whitespace-nowrap text-xs tabular-nums ${blocked ? 'text-destructive' : 'text-muted-foreground'}`} title={tip} aria-label={tip}>{formatCountdown(Math.max(0, target - now))}</span>;
}
