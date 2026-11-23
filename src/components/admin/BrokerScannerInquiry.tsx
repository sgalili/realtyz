import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { scannerCall } from './BrokerScannerPanel';
export const scannerLabels: Record<string, string> = { pending_source: 'ממתין לקריאת המודעה', reading_source: 'קורא את המודעה', ready: 'ממתין לחלון שליחה', sending: 'שולח פנייה', awaiting_reply: 'ממתין לתשובת יד2', completed: 'המספר נשמר', needs_manual: 'נדרשת בדיקה ידנית', cancelled: 'בוטל', failed: 'נכשל' };
const live = ['pending_source','reading_source','ready','sending','awaiting_reply'];

/** Status-only: the magnifying-glass discovery queues scanner inquiries. Hidden once a personal number is saved. */
export function BrokerScannerInquiry({ brokerId, hasWhatsApp }: { brokerId: string; name?: string; hasWhatsApp: boolean }) {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['broker-wa-scanner-job', brokerId], retry: false, enabled: !hasWhatsApp, queryFn: () => scannerCall({ action: 'status', broker_id: brokerId }),
    refetchInterval: q => live.includes(q.state.data?.job?.status ?? '') ? 15000 : false });
  const job = status.data?.job;
  // A correlated reply saved the number: refresh the card so it switches to the invitation button.
  useEffect(() => { if (job?.status === 'completed' || status.data?.contact) void qc.invalidateQueries({ queryKey: ['broker-whatsapp-job', brokerId] }); }, [job?.status, status.data?.contact, brokerId, qc]);
  if (hasWhatsApp || status.data?.contact || !job) return null;
  return <span className="text-xs text-muted-foreground" title={job.last_error ?? undefined}>{scannerLabels[job.status] ?? job.status}</span>;
}
