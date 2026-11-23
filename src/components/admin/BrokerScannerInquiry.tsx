import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { scannerCall } from './BrokerScannerPanel';

export const scannerLabels: Record<string, string> = { pending_source: 'ממתין לקריאת המודעה', reading_source: 'קורא את המודעה', ready: 'ממתין לחלון שליחה', sending: 'שולח פנייה', awaiting_reply: 'ממתין לתשובת יד2', completed: 'המספר נשמר', needs_manual: 'נדרשת בדיקה ידנית', cancelled: 'בוטל', failed: 'נכשל' };
const live = ['pending_source','reading_source','ready','sending','awaiting_reply'];

/** Visible only without a saved personal number. Cloud rechecks every rule. */
export function BrokerScannerInquiry({ brokerId, name, hasWhatsApp }: { brokerId: string; name: string; hasWhatsApp: boolean }) {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['broker-wa-scanner-job', brokerId], retry: false, enabled: !hasWhatsApp, queryFn: () => scannerCall({ action: 'status', broker_id: brokerId }),
    refetchInterval: q => live.includes(q.state.data?.job?.status ?? '') ? 15000 : false });
  const enqueue = useMutation({ mutationFn: () => scannerCall({ action: 'enqueue', broker_id: brokerId, confirmed: true }), onSuccess: () => { toast.success('הפנייה נכנסה לתור המוגבל'); void qc.invalidateQueries({ queryKey: ['broker-wa-scanner-job', brokerId] }); }, onError: (e: Error) => toast.error(e.message) });
  if (hasWhatsApp || status.data?.contact) return null;
  const job = status.data?.job; const s = status.data?.settings;
  const running = live.includes(job?.status ?? '');
  const available = !!s?.enabled && !s.paused && !!status.data?.credentials_ready;
  return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
    {job && <span title={job.last_error ?? undefined}>{scannerLabels[job.status] ?? job.status}</span>}
    {!running && <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-lead-whatsapp" aria-label={`פנייה דרך קו הסריקה עבור ${name}`} disabled={!available || enqueue.isPending} title={available ? 'שליחת נוסח יד2 מהקו הייעודי' : 'קו הסריקה מושהה'}>{enqueue.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button></AlertDialogTrigger>
      <AlertDialogContent dir="rtl" className="text-right"><AlertDialogHeader><AlertDialogTitle>פנייה ליד2 עבור {name}</AlertDialogTitle><AlertDialogDescription>נוסח הפנייה מהמודעה יישלח מקו הסריקה הייעודי, במסגרת המכסה ושעות הפעילות. המספר יישמר רק אם התשובה תשויך בבירור למודעה זו.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter className="flex-row justify-between gap-2"><AlertDialogCancel>ביטול</AlertDialogCancel><AlertDialogAction onClick={() => enqueue.mutate()}>אישור</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
  </span>;
}