import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Upload, Pause, Play, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { validImportParameters } from '../../../supabase/functions/_shared/brokerImportQueue';

const stages: Record<string,string> = {scanning:'סריקה ב־Bright Data',enriching:'איסוף פרטי מתווכים',validating:'בדיקת מודעות פעילות',creating:'אימות רישיון ויצירת מתווך',importing:'ייבוא טיוטות',completed:'הייבוא הסתיים'};
export function BrokerBatchImportCard() {
  const [open,setOpen]=useState(false);
  const [target,setTarget]=useState(10); const [min,setMin]=useState(3);const [max,setMax]=useState(10);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const qc=useQueryClient();
  const {data:jobs}=useQuery({queryKey:['admin-broker-import-jobs'],queryFn:async()=>{const {data,error}=await supabase.from('broker_import_jobs').select('*').order('created_at',{ascending:false}).limit(5);if(error)throw error;return data;},refetchInterval:query=>query.state.data?.some(j=>j.status==='running'||(j.lease_until&&Date.parse(j.lease_until)>Date.now()))?4000:false});
  const current=jobs?.[0];
  const action=async (kind:'start'|'pause'|'resume')=>{
    setBusy(true);setError('');
    try {
      const {data,error}=await supabase.functions.invoke('admin-broker-import-queue',{body:kind==='start'?{action:kind,target_brokers:target,min_listings:min,max_listings:max}:{action:kind,job_id:current?.id}});
      if(error){const d=error instanceof FunctionsHttpError?await error.context.json().catch(()=>null):null;throw new Error(d?.error??'הבקשה נכשלה');}
      if(data?.error)throw new Error(data.error);
      await qc.invalidateQueries({queryKey:['admin-broker-import-jobs']});
      if(kind==='start')setOpen(false);
    }catch(e){setError(e instanceof Error?e.message:'הבקשה נכשלה');}finally{setBusy(false);}
  };
  const checkpoint=current?.checkpoint as {brokers?:{listing_urls:string[]}[];brokerIndex?:number;listingIndex?:number}|undefined;
  const remaining=checkpoint?.brokers?.slice(checkpoint.brokerIndex??0).reduce((n,b)=>n+b.listing_urls.length,0);
  const estimate=current?.step_average_ms && remaining?Math.ceil(Number(current.step_average_ms)*remaining/60000):null;
  return <section dir="rtl" className="space-y-3 border-b border-border py-4 text-right">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">ייבוא קבוצת מתווכים · Bright Data</h3><Button variant="outline" onClick={()=>setOpen(true)}><Upload className="h-4 w-4" />ייבוא חדש</Button></div>
    {current && <div role="status" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm">{current.status==='running'&&<Loader2 className="h-4 w-4 animate-spin" />}{current.status==='paused'?'מושהה · ':''}{stages[current.stage]??current.stage}</span><span className="text-sm text-muted-foreground">{current.brokers_done}/{current.target_brokers} מתווכים · {current.listings_done} טיוטות{current.skipped>0?` · ${current.skipped} דולגו`:''}</span></div>
      <Progress value={current.status==='completed'?100:current.brokers_done/current.target_brokers*100} />
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{current.status==='running'?(estimate?`זמן משוער שנותר: כ־${estimate} דקות`:'זמן משוער: יופיע לאחר השלמת שלב ראשון'):current.status==='completed'&&current.brokers_done<current.target_brokers?'הסריקה הסתיימה עם פחות מתווכים מהיעד':''}{checkpoint?.brokers?.length?` · מתווך ${(checkpoint.brokerIndex??0)+1}, מודעה ${(checkpoint.listingIndex??0)+1}`:''}</span>{['running','paused','failed'].includes(current.status)&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>void action(current.status==='running'?'pause':'resume')}>{current.status==='running'?<Pause className="h-4 w-4" />:<Play className="h-4 w-4" />}{current.status==='running'?'עצירה':'המשך'}</Button>}</div>
      {current.status==='paused'&&current.lease_until&&Date.parse(current.lease_until)>Date.now()&&<p className="text-xs text-muted-foreground">הפעולה שכבר התחילה תסתיים ותישמר; לא תתחיל פעולה נוספת.</p>}
      {current.error&&<p role="alert" className="text-sm text-destructive">{current.error}</p>}
    </div>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="max-w-lg"><DialogHeader><DialogTitle>ייבוא קבוצת מתווכים</DialogTitle></DialogHeader><div className="grid gap-4">
      <div className="grid gap-1.5"><Label htmlFor="broker-target">מספר מתווכים רצוי</Label><Input id="broker-target" type="number" min={1} max={100} value={target} onChange={e=>setTarget(Number(e.target.value))} /></div>
      <div className="grid gap-1.5"><Label htmlFor="broker-min">מינימום נכסים פעילים למתווך</Label><Input id="broker-min" type="number" min={1} max={10} value={min} onChange={e=>setMin(Number(e.target.value))} /></div>
      <div className="grid gap-1.5"><Label htmlFor="broker-max">מקסימום נכסים פעילים למתווך</Label><Input id="broker-max" type="number" min={min} max={10} value={max} onChange={e=>setMax(Number(e.target.value))} /></div>
      <p className="text-sm text-muted-foreground">לא יישלחו הודעות. רישיונות ללא התאמה יקבלו אישור ידני בשמך. הסריקה כרוכה בשימוש ב־Bright Data.</p>
      <div className="flex justify-between gap-2"><Button variant="outline" onClick={()=>setOpen(false)}>ביטול</Button><Button disabled={busy||current?.status==='running'||!validImportParameters(target,min,max)} onClick={()=>void action('start')}><Upload className="h-4 w-4" />{busy?'מתחיל…':'התחלת ייבוא'}</Button></div>
    </div></DialogContent></Dialog>
  </section>;
}
