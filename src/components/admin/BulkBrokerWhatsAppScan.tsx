import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Search, Square } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type Batch = { id: string; status: 'running' | 'stopped' | 'completed' };
async function call(body: Record<string, unknown>) {
  const {data,error}=await supabase.functions.invoke('broker-whatsapp-worker',{body});
  if(error || data?.error)throw new Error(data?.error || error?.message || 'הפעולה נכשלה');
  return data as {batch?:Batch|null;results?:{status:string}[];next?:string|null;stopped?:boolean};
}

export function BulkBrokerWhatsAppScan() {
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const {user}=useAuth();
  const key=['broker-whatsapp-batch',user?.id];
  const stopping=useRef(false);
  const working=useRef(false);
  const currentBatch=useRef<string|null>(null);
  const status=useQuery({queryKey:key,enabled:!!user,retry:false,queryFn:()=>call({action:'batch_status'}),refetchInterval:query=>query.state.data?.batch?.status==='running'?4000:false});
  const cancel=useMutation({mutationFn:(id:string)=>call({action:'cancel_batch',batch_id:id}),onSuccess:()=>{
    qc.setQueryData(key,{batch:null});void qc.invalidateQueries({queryKey:['broker-whatsapp-job']});toast.success('איתור WhatsApp נעצר. המספרים שנמצאו נשמרו.');
  },onError:()=>{stopping.current=false;toast.error('העצירה לא אושרה. אפשר לנסות שוב.');}});
  const running=busy || status.data?.batch?.status==='running';
  const stop=()=>{stopping.current=true;const id=currentBatch.current??status.data?.batch?.id;if(id)cancel.mutate(id);};
  const scan = async () => {
    if (working.current) return;
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
        const data=await call({action:'enqueue_missing',batch_id:batch.id,...(after?{after}:{})});
        if(stopping.current || data.stopped)return;
        queued += (data.results??[]).filter(r=>r.status==='queued').length;
        skipped += (data.results??[]).filter(r=>r.status==='skipped').length;
        after = data.next ?? undefined;
      } while (after && !stopping.current);
      toast.success(`${queued} מתווכים בתור הגילוי${skipped ? ` · ${skipped} חשבונות ללא מקור מתאים או שאינם מתווכים` : ''}`);
    } catch { if(!stopping.current)toast.error(`הוספת המשימות נעצרה; ${queued} משימות שכבר נשמרו ימשיכו בתור`); }
    finally { working.current=false;setBusy(false);void qc.invalidateQueries({queryKey:key});void qc.invalidateQueries({ queryKey: ['broker-whatsapp-job'] });void qc.invalidateQueries({queryKey:['broker-whatsapp-invitation-eligibility']}); }
  };
  return <div className="flex justify-start"><Button variant="ghost" className="text-lead-whatsapp" disabled={cancel.isPending || status.isLoading} aria-busy={busy || cancel.isPending} onClick={()=>running?stop():void scan()}>{cancel.isPending?<Loader2 className="h-4 w-4 animate-spin"/>:running?<Square className="h-4 w-4"/>:<Search className="h-4 w-4"/>}{running?'עצירת איתור WhatsApp':'איתור WhatsApp לכל המתווכים'}</Button></div>;
}