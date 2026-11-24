import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Search, Square } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { brokerWhatsAppRequest } from '@/lib/brokerWhatsAppRequest';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SelectAllRow, SelectBox } from '@/components/ui/multi-select-controls';
import { useSuperAdminGate } from '@/hooks/useSuperAdminGate';
import { newestImportsFirst } from '@/lib/adminImportPresentation';

type Batch = { id: string; status: 'running' | 'stopped' | 'completed' };
async function call(body: Record<string, unknown>) {
  return brokerWhatsAppRequest<{batch?:Batch|null;results?:{status:string}[];next?:string|null;stopped?:boolean}>('broker-whatsapp-worker', body);
}

export function BulkBrokerWhatsAppScan() {
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const {user}=useAuth();
  const gate = useSuperAdminGate();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const targets = useQuery({ queryKey: ['broker-whatsapp-bulk-targets', gate.uid], enabled: open && gate.enabled, retry: false, queryFn: async () => {
    const data = await brokerWhatsAppRequest<{brokers?: { user_id: string; full_name: string; created_at: string }[]}>('broker-whatsapp-worker', { action: 'bulk_targets' });
    const rows = newestImportsFirst((data?.brokers ?? []) as { user_id: string; full_name: string; created_at: string }[]);
    setSelected(new Set(rows.map(row => row.user_id)));
    return rows;
  } });
  const key=['broker-whatsapp-batch',user?.id];
  const stopping=useRef(false);
  const working=useRef(false);
  const currentBatch=useRef<string|null>(null);
  const status=useQuery({queryKey:key,enabled:!!user,retry:false,queryFn:()=>call({action:'batch_status'}),refetchInterval:query=>query.state.error || query.state.data?.batch?.status==='running'?4000:false});
  const cancel=useMutation({mutationFn:(id:string)=>call({action:'cancel_batch',batch_id:id}),onSuccess:()=>{
    qc.setQueryData(key,{batch:null});void qc.invalidateQueries({queryKey:['broker-whatsapp-job']});toast.success('איתור WhatsApp נעצר. המספרים שנמצאו נשמרו.');
  },onError:()=>{stopping.current=false;toast.error('העצירה לא אושרה. אפשר לנסות שוב.');}});
  const running=busy || status.data?.batch?.status==='running';
  const stop=()=>{stopping.current=true;const id=currentBatch.current??status.data?.batch?.id;if(id)cancel.mutate(id);};
  const scan = async () => {
    if (working.current || selected.size === 0) return;
    const brokerIds = [...selected];
    setOpen(false);
    working.current=true;stopping.current=false;currentBatch.current=null;
    setBusy(true);
    let after: string | undefined;
    let queued = 0;
    let skipped = 0;
    try {
      const started=await call({action:'start_batch'});
      if(!started.batch)throw new Error('לא נוצרה פעולת איתור');
      const batch=started.batch;
      currentBatch.current=batch.id;qc.setQueryData(key,{batch});
      if(stopping.current){await cancel.mutateAsync(batch.id);return;}
      do {
        const data=await call({action:'enqueue_missing',batch_id:batch.id,broker_ids:brokerIds,...(after?{after}:{})});
        if(stopping.current || data.stopped)return;
        queued += (data.results??[]).filter(r=>r.status==='queued').length;
        skipped += (data.results??[]).filter(r=>r.status==='skipped').length;
        after = data.next ?? undefined;
      } while (after && !stopping.current);
      toast.success(`${queued} מתווכים בתור הגילוי${skipped ? ` · ${skipped} חשבונות ללא מקור מתאים או שאינם מתווכים` : ''}`);
    } catch { if(!stopping.current)toast.error(`הוספת המשימות נעצרה; ${queued} משימות שכבר נשמרו ימשיכו בתור`); }
    finally { working.current=false;setBusy(false);void qc.invalidateQueries({queryKey:key});void qc.invalidateQueries({ queryKey: ['broker-whatsapp-job'] });void qc.invalidateQueries({queryKey:['broker-whatsapp-invitation-eligibility']}); }
  };
  const label=running?'עצירת איתור WhatsApp':'איתור וייבוא WhatsApp לכל המתווכים החסרים';
  // Icon-only: lives inside the scanner card header next to the connection control.
  return <><Button size="icon" variant="ghost" className="text-lead-whatsapp" aria-label={label} title={label} disabled={cancel.isPending || status.isLoading} aria-busy={busy || cancel.isPending} onClick={()=>{ if(running)stop();else { setSelected(new Set());void qc.invalidateQueries({queryKey:['broker-whatsapp-bulk-targets']});setOpen(true); } }}>{cancel.isPending?<Loader2 className="h-4 w-4 animate-spin"/>:running?<Square className="h-4 w-4"/>:<Search className="h-4 w-4"/>}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="max-h-[85dvh] max-w-lg overflow-y-auto text-right"><DialogHeader><DialogTitle>גילוי מספרי וואטסאפ</DialogTitle><DialogDescription>להתחיל גילוי עבור המתווכים שנבחרו?</DialogDescription></DialogHeader>
      {targets.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : targets.isError ? <p role="alert" className="text-destructive">{targets.error.message}</p> : <>
        <SelectAllRow total={targets.data?.length ?? 0} selected={selected.size} onToggle={() => setSelected(selected.size === targets.data?.length ? new Set() : new Set(targets.data?.map(b => b.user_id)))} />
        <ul className="max-h-[45dvh] overflow-y-auto divide-y divide-border">{targets.data?.map(b => <li key={b.user_id} className="flex items-center gap-3 py-3"><SelectBox checked={selected.has(b.user_id)} label={`בחירת ${b.full_name}`} onChange={() => setSelected(previous => { const next = new Set(previous); if(next.has(b.user_id))next.delete(b.user_id);else next.add(b.user_id);return next; })} /><span className="min-w-0 break-words">{b.full_name}</span></li>)}</ul>
        {!targets.data?.length && <p className="text-muted-foreground">אין מתווכים זמינים לגילוי כרגע.</p>}
      </>}
      <div className="flex items-center justify-between gap-3"><Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button><Button disabled={targets.isFetching || targets.isError || !selected.size} onClick={() => void scan()}><Search className="h-4 w-4" />התחלת גילוי ({selected.size})</Button></div>
    </DialogContent></Dialog>
  </>;
}
