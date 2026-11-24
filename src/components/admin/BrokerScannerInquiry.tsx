import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpToLine, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BrokerNumberEditor } from './BrokerNumberEditor';
import { scannerCall } from './BrokerScannerPanel';
import { formatCountdown, scannerDelayReason, scannerEta, scannerFailureReason } from '@/lib/brokerScannerState';
import { brokerUserError } from '../../../supabase/functions/_shared/brokerRecovery';
export const scannerLabels: Record<string, string> = { pending_source: 'ממתין לקריאת המודעה', reading_source: 'קורא את המודעה', ready: 'ממתין בתור לשליחה', sending: 'שולח פנייה', awaiting_reply: 'ממתין לתשובת יד2', completed: 'המספר נשמר', needs_manual: 'נדרשת בדיקה ידנית', cancelled: 'בוטל', failed: 'נכשל' };
const live = ['pending_source','reading_source','ready','sending','awaiting_reply'];

/** Status-only: the magnifying-glass discovery queues scanner inquiries. Hidden once a personal number is saved. */
export function BrokerScannerInquiry({ brokerId, name = 'מתווך', hasWhatsApp, lookupStatus, lookupError }: { brokerId: string; name?: string; hasWhatsApp: boolean; lookupStatus?: string; lookupError?: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const status = useQuery({ queryKey: ['broker-wa-scanner-job', brokerId], retry: false, enabled: !hasWhatsApp, queryFn: () => scannerCall({ action: 'status', broker_id: brokerId }),
    refetchInterval: q => q.state.error || live.includes(q.state.data?.job?.status ?? '') ? 15000 : false });
  const job = status.data?.job;
  // A correlated reply saved the number: refresh the card so it switches to the invitation button.
  useEffect(() => { if (job?.status === 'completed' || status.data?.contact) void qc.invalidateQueries({ queryKey: ['broker-whatsapp-job', brokerId] }); }, [job?.status, status.data?.contact, brokerId, qc]);
  const [now, setNow] = useState(Date.now());
  const queued = ['pending_source', 'reading_source', 'ready'].includes(job?.status ?? '');
  const ticking = live.includes(job?.status ?? '') || !!lookupStatus;
  useEffect(() => { if (!ticking) return; setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [ticking]);
  const st = status.data?.settings;
  // Anchor once per meaningful queue change, NOT on every tick or identical status poll.
  const target = useMemo(() => {
    const anchor = Date.now();
    if (job?.status === 'awaiting_reply') return Date.parse(job.reply_deadline ?? '') || 0;
    if (job?.status === 'reading_source') return Date.parse(job.lease_until ?? '') || 0;
    if (job?.status === 'sending') return (Date.parse(job.send_reserved_at ?? '') || anchor) + 90000;
    return queued && st ? Math.max(Date.parse(job?.next_source_at ?? '') || 0, scannerEta({ ...st, outstanding_until: status.data?.outstanding_until, used_today: status.data?.used_today ?? 0, queue_ahead: status.data?.queue_ahead ?? 0 }, anchor)) : 0;
  }, [job?.id, job?.status, job?.reply_deadline, job?.lease_until, job?.send_reserved_at, job?.next_source_at, queued, st?.next_send_at, st?.daily_cap, st?.jitter_min_seconds, st?.jitter_max_seconds, status.data?.queue_ahead, status.data?.used_today, status.data?.outstanding_until]);
  const lookupStarted = useMemo(() => Date.now(), [brokerId, lookupStatus]);
  const promote = useMutation({ mutationFn: async () => { const result = await scannerCall({ action: 'promote', job_id: job?.id }); if (result.ok !== true) throw new Error(result.error ?? 'לא ניתן לקדם את הפנייה כרגע'); return result; }, onSuccess: () => { toast.success('הפנייה קודמה לראש התור'); void qc.invalidateQueries({ queryKey: ['broker-wa-scanner-job'] }); }, onError: (error: Error) => toast.error(error.message) });
  if (hasWhatsApp || status.data?.contact || (!lookupStatus && (!job || job.status === 'completed'))) return null;
  const blocked = queued && st ? scannerDelayReason({ ...st, used_today: status.data?.used_today ?? 0, outstanding_until: status.data?.outstanding_until }, now) : null;
  const label = job ? scannerLabels[job.status] ?? job.status : lookupStatus === 'running' ? 'מאתר מספר במודעה' : 'ממתין לקריאת המודעה';
  const reason = job?.last_error ?? lookupError;
  const errorText = reason ? scannerFailureReason(reason) ?? brokerUserError(reason) : '';
  const tip = `${label}${blocked ? ` · ${blocked}` : ''}${errorText ? ` · ${errorText}` : ''}`;
  const time = formatCountdown(target ? target - now : now - lookupStarted);
  return <>
    <Button variant="ghost" className={`h-8 min-w-24 shrink-0 justify-between gap-3 whitespace-nowrap px-1 text-xs tabular-nums ${blocked ? 'text-destructive' : 'text-muted-foreground'}`} title={tip} aria-label={`פרטי גילוי וואטסאפ של ${name}`} onClick={() => setOpen(true)}>
      <span dir="ltr">{ticking ? time : label}</span>{ticking && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-lead-whatsapp motion-reduce:animate-none" />}
    </Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="max-w-sm text-right"><DialogHeader><DialogTitle>גילוי וואטסאפ · {name}</DialogTitle><DialogDescription>{label}</DialogDescription></DialogHeader>
      <p role="status" className="text-sm">{blocked ?? (status.data?.outstanding && queued ? 'הקו ממתין לתשובה לפנייה קודמת' : 'מצב הפנייה מתעדכן אוטומטית')}</p>
      {ticking && <p className="text-sm text-muted-foreground">{target ? job?.status === 'awaiting_reply' ? 'הזמן שנותר לקבלת תשובה' : 'הזמן המשוער לשלב הבא' : 'זמן שחלף באיתור'}: <span dir="ltr" className="inline-block tabular-nums">{time}</span>{target > 0 && now >= target && <span className="block">ממתין לעדכון מהסריקה</span>}</p>}
      {queued && <p className="text-sm text-muted-foreground">מיקום בתור: {(status.data?.queue_ahead ?? 0) + 1} · פניות היום: {status.data?.used_today ?? 0}/{st?.daily_cap ?? 0}</p>}
      {errorText && <p className="break-words text-sm text-destructive">{errorText}</p>}
      {status.error && <p className="text-sm text-muted-foreground">רענון המצב נכשל זמנית. הנתונים האחרונים נשמרו במסך.</p>}
      {queued && <p className="text-xs text-muted-foreground">הזמן משוער: תשובות לפניות קודמות עשויות להאריך את ההמתנה, עד שעתיים לכל פנייה.</p>}
      <BrokerNumberEditor brokerId={brokerId} name={name} kind="whatsapp" discoveryBusy={ticking} />
      {job && ['pending_source', 'ready'].includes(job.status) && <Button variant="outline" disabled={promote.isPending || (status.data?.queue_ahead ?? 0) === 0} onClick={() => promote.mutate()}>{promote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpToLine className="h-4 w-4" />}קידום לראש התור</Button>}
    </DialogContent></Dialog>
  </>;
}
