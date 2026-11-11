import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Upload, Pause, Play, Loader2, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { validImportParameters } from '../../../supabase/functions/_shared/brokerImportQueue';
import { agencyUrl } from '../../../supabase/functions/_shared/yad2Agencies';

const LINKS_KEY='toraff-broker-import-links';
const LIMIT_KEY='toraff-broker-import-link-limit';
const validLink=(l:string)=>/^https:\/\//i.test(l)&&Boolean(agencyUrl(l));
// Puts each pasted link on its own line, dropping blank lines between them.
const separateLinks=(t:string)=>t.replace(/[ \t]+(?=https?:\/\/)/gi,'\n').replace(/\n{2,}/g,'\n');

const stages: Record<string,string> = {scanning:'סריקה ב־Bright Data',enriching:'איסוף פרטי מתווכים',validating:'בדיקת מודעות פעילות',creating:'אימות רישיון ויצירת מתווך',importing:'ייבוא טיוטות',completed:'הייבוא הסתיים'};
export function BrokerBatchImportCard() {
  const [open,setOpen]=useState(false);
  const [target,setTarget]=useState(10); const [min,setMin]=useState(3);const [max,setMax]=useState(10);
  const [links,setLinksState]=useState(()=>{try{return localStorage.getItem(LINKS_KEY)??'';}catch{return '';}});
  const setLinks=(v:string)=>{setLinksState(v);try{v?localStorage.setItem(LINKS_KEY,v):localStorage.removeItem(LINKS_KEY);}catch{/* storage unavailable */}};
  const [linkLimit,setLinkLimitState]=useState(()=>{const n=Number((()=>{try{return localStorage.getItem(LIMIT_KEY);}catch{return null;}})());return n>=1&&n<=10?n:10;});
  const setLinkLimit=(n:number)=>{setLinkLimitState(n);try{localStorage.setItem(LIMIT_KEY,String(n));}catch{/* storage unavailable */}};
  const linkLines=links.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const invalidCount=linkLines.filter(l=>!validLink(l)).length;const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const qc=useQueryClient();
  const {data:jobs}=useQuery({queryKey:['admin-broker-import-jobs'],queryFn:async()=>{const {data,error}=await supabase.from('broker_import_jobs').select('*').order('created_at',{ascending:false}).limit(5);if(error)throw error;return data;},refetchInterval:query=>query.state.data?.some(j=>j.status==='running'||(j.lease_until&&Date.parse(j.lease_until)>Date.now()))?4000:false});
  const current=jobs?.[0];
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{if(!current||current.status==='completed')return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[current?.status]);
  const action=async (kind:'start'|'start_urls'|'pause'|'resume'|'reset_cooldown')=>{
    setBusy(true);setError('');setNotice('');
    try {
      const urls=links.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
      const {data,error}=await supabase.functions.invoke('admin-broker-import-queue',{body:kind==='start'?{action:kind,target_brokers:target,min_listings:min,max_listings:max}:kind==='start_urls'?{action:kind,urls,max_listings:linkLimit}:{action:kind,job_id:current?.id}});
      if(error){const d=error instanceof FunctionsHttpError?await error.context.json().catch(()=>null):null;throw new Error(d?.error??'הבקשה נכשלה');}
      if(data?.error)throw new Error(data.error);
      await qc.invalidateQueries({queryKey:['admin-broker-import-jobs']});
      if(kind==='start')setOpen(false);
      if(kind==='start_urls'){setLinks('');setNotice(`${data.accepted} קישורים נכנסו לתור${data.rejected?` · ${data.rejected} קישורים לא תקינים דולגו`:''}`);}
    }catch(e){setError(e instanceof Error?e.message:'הבקשה נכשלה');}finally{setBusy(false);}
  };
  const checkpoint=current?.checkpoint as {waitUntil?:number;waitReason?:string;rateRetries?:number;brokers?:{listing_urls:string[]}[];brokerIndex?:number;listingIndex?:number;page?:number;deal?:string;source?:string;rows?:unknown[];enriched?:number;enrichUrls?:string[];cacheHits?:number;liveFetches?:number;timeoutSkips?:number}|undefined;
  const waitSeconds=Math.max(0,Math.ceil(((checkpoint?.waitUntil??0)-now)/1000));
  const remaining=checkpoint?.brokers?.slice(checkpoint.brokerIndex??0).reduce((n,b)=>n+b.listing_urls.length,0);
  const estimate=current?.step_average_ms && remaining?Math.ceil(Number(current.step_average_ms)*remaining/60000):null;
  // A running job with no active step and no update for 2 minutes is stalled, not progressing.
  const stalled=current?.status==='running' && !(current.lease_until&&Date.parse(current.lease_until)>Date.now()) && Date.now()-Date.parse(current.updated_at)>120_000;
  const scanInfo=checkpoint&&['scanning','enriching'].includes(current?.stage??'')?[`${checkpoint.source==='urls'?'קישורים שהודבקו':checkpoint.source==='agencies'?'משרדי תיווך':checkpoint.deal==='rent'?'השכרה':'מכירה'} · עמוד ${checkpoint.page??1}`,checkpoint.rows?.length?`${checkpoint.rows.length} כרטיסים נסרקו`:null,checkpoint.enriched?`${checkpoint.enriched} משרדים נפתחו לאיתור מתווך`:null,checkpoint.enrichUrls?.length?`${checkpoint.enrichUrls.length} ממתינות`:null,checkpoint.cacheHits?`${checkpoint.cacheHits} נטענו מהמטמון ללא עלות`:null,checkpoint.timeoutSkips?`${checkpoint.timeoutSkips} עמודים איטיים דולגו`:null].filter(Boolean).join(' · '):'';
  const newImportButton=<Button className="h-11 shrink-0 px-3 text-base" variant="outline" disabled={busy} onClick={()=>{setError('');setTarget(10);setMin(3);setMax(10);setOpen(true);}}><Upload className="h-5 w-5" />ייבוא חדש</Button>;
  return <section dir="rtl" className="space-y-4 border-b border-border py-5 text-right">
    <div className="space-y-3 rounded-xl border border-border/70 p-4">
      <h3 className="text-lg font-semibold">ייבוא ישיר מהדבקת קישורים</h3>
      <Textarea dir="ltr" className="min-h-28 text-left text-base" placeholder="https://www.yad2.co.il/realestate/agency/..." value={links} onChange={e=>setLinks(e.target.value)} onPaste={e=>{e.preventDefault();const el=e.currentTarget;const pasted=separateLinks(e.clipboardData.getData('text').trim());const next=separateLinks(links.slice(0,el.selectionStart)+pasted+'\n'+links.slice(el.selectionEnd));setLinks(next);}} onKeyDown={e=>{if(e.key==='Enter'){const el=e.currentTarget;const before=links.slice(0,el.selectionStart);if(!before.trim()||before.endsWith('\n'))e.preventDefault();}}} aria-label="קישורי מתווכים, קישור בכל שורה" />
      {linkLines.length>0&&<ol dir="ltr" className="max-h-56 space-y-1 overflow-y-auto text-left text-sm" aria-label="קישורים ממוספרים">{linkLines.map((l,i)=>{const ok=validLink(l);return <li key={i} className={`flex items-start gap-2 rounded-md border px-2 py-1 ${ok?'border-border/60':'border-destructive bg-destructive/10 text-destructive'}`}><span className="shrink-0 font-semibold tabular-nums">{i+1}.</span><span className="min-w-0 flex-1 break-all">{l}</span>{!ok&&<span dir="rtl" className="shrink-0 font-medium">⚠ קישור לא תקין</span>}</li>;})}</ol>}
      {invalidCount>0&&<p role="alert" className="text-base font-medium text-destructive">{invalidCount} קישורים לא תקינים מסומנים באדום. יש להזין קישור משרד/מתווך של יד2 שמתחיל ב־https://www.yad2.co.il/realestate/agency/</p>}
      <div className="flex flex-row items-end justify-end gap-2"><div className="w-28 shrink-0 space-y-1"><Label htmlFor="link-limit" className="text-sm">מקס׳ נכסים לקישור</Label><Input id="link-limit" type="number" inputMode="numeric" min={1} max={10} className="h-11 text-base" value={linkLimit} onChange={e=>{const n=Math.round(Number(e.target.value));if(Number.isFinite(n))setLinkLimit(Math.min(10,Math.max(1,n)));}} /></div><Button className="h-11 text-base" disabled={busy||!links.trim()||Boolean(current?.lease_until&&Date.parse(current.lease_until)>now)} onClick={()=>{if(current&&['running','paused'].includes(current.status)&&!window.confirm('להפסיק את הייבוא הפעיל ולהתחיל ייבוא מהקישורים? הטיוטות שכבר נשמרו לא יימחקו.'))return;void action('start_urls');}}><Upload className="h-5 w-5" />ייבוא מתווכים מקישורים שהודבקו</Button></div>
      {notice&&<p className="text-base text-muted-foreground">{notice}</p>}
    </div>
    {!current&&<div className="flex items-center justify-end gap-2">{newImportButton}</div>}
    {current && <div role="status" className="space-y-3 rounded-xl border border-border/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2 text-lg font-semibold">{current.status==='running'&&!stalled&&<Loader2 className="h-5 w-5 animate-spin" />}{current.status==='paused'?'מושהה · ':''}{stages[current.stage]??current.stage}</span><span className="text-base text-muted-foreground">{current.brokers_done}/{current.target_brokers} מתווכים · {current.listings_done} טיוטות{current.skipped>0?` · ${current.skipped} דולגו`:''}</span></div>
      <Progress className="h-3" value={current.status==='completed'?100:current.brokers_done/current.target_brokers*100} />
      {current.status==='completed'&&<p className="text-base font-medium">סיכום: יובאו {current.brokers_done} מתווכים ו־{current.listings_done} נכסים כטיוטות{current.skipped>0?` · ${current.skipped} דולגו`:''}</p>}
      {scanInfo&&<p className="text-base text-muted-foreground">{scanInfo}</p>}
      {current.status!=='completed'&&waitSeconds>0&&<p aria-live="polite" className="text-base font-medium text-muted-foreground">{checkpoint?.waitReason==='rate_limit'?'מגבלת בקשות (429) · הייבוא מושהה · המשך ידני יתאפשר':'השהיית בטיחות בין סריקות למניעת עומס…'} · בעוד {waitSeconds} שניות</p>}
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 text-base text-muted-foreground">{current.status==='running'&&!stalled?(estimate?`זמן משוער שנותר: כ־${estimate} דקות`:current.step_average_ms?`כ־${Math.round(Number(current.step_average_ms)/1000)} שניות לכל שלב · זמן כולל יוצג לאחר איתור מתווכים`:'זמן משוער: יופיע לאחר השלמת שלב ראשון'):current.status==='completed'&&current.brokers_done<current.target_brokers?'הסריקה הסתיימה עם פחות מתווכים מהיעד':''}{checkpoint?.brokers?.length?` · מתווך ${(checkpoint.brokerIndex??0)+1}, מודעה ${(checkpoint.listingIndex??0)+1}`:''}</span><div className="flex shrink-0 flex-row items-center gap-2">{['running','paused','failed'].includes(current.status)&&<Button variant="outline" className="h-11 shrink-0 px-3 text-base" disabled={busy||(checkpoint?.waitReason==='rate_limit'&&waitSeconds>0&&current.status!=='running')} onClick={()=>void action(current.status==='running'&&!stalled?'pause':'resume')}>{current.status==='running'&&!stalled?<Pause className="h-5 w-5" />:<Play className="h-5 w-5" />}{current.status==='running'&&!stalled?'עצירה':'המשך'}</Button>}{newImportButton}</div></div>
      {current.status==='paused'&&current.lease_until&&Date.parse(current.lease_until)>Date.now()&&<p className="text-base text-muted-foreground">הפעולה שכבר התחילה תסתיים ותישמר; לא תתחיל פעולה נוספת.</p>}
      {stalled&&<p role="alert" className="text-base font-medium text-destructive">שגיאת חיבור ל־Bright Data - אנא בדוק את המפתחות או נסה שוב</p>}
      {current.error&&<div className="flex flex-wrap items-center gap-3"><p role="alert" className="text-base font-medium text-destructive">{current.error}</p>{checkpoint?.waitReason==='rate_limit'&&['paused','failed'].includes(current.status)&&<Button variant="outline" className="text-base" disabled={busy||Boolean(current.lease_until&&Date.parse(current.lease_until)>now)} onClick={()=>{if(window.confirm('לאפס את השהיית 429 ולנקות את השגיאה? ההתקדמות והמטמון יישמרו. האיפוס אינו מסיר מגבלה אצל Bright Data; המשך מוקדם עלול להיתקל שוב ב־429.'))void action('reset_cooldown');}}><RotateCcw className="h-5 w-5" />איפוס השהיה וניקוי שגיאה</Button>}</div>}
    </div>}
    {error&&<p role="alert" className="text-base text-destructive">{error}</p>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="max-w-lg"><DialogHeader><DialogTitle className="text-2xl">ייבוא קבוצת מתווכים</DialogTitle></DialogHeader><div className="grid gap-5">
      <div className="grid gap-2"><Label className="text-base" htmlFor="broker-target">מספר מתווכים רצוי</Label><Input className="h-12 text-lg" id="broker-target" type="number" min={1} max={100} value={target} onChange={e=>setTarget(Number(e.target.value))} /></div>
      <div className="grid gap-2"><Label className="text-base" htmlFor="broker-min">מינימום נכסים פעילים למתווך</Label><Input className="h-12 text-lg" id="broker-min" type="number" min={1} max={10} value={min} onChange={e=>setMin(Number(e.target.value))} /></div>
      <div className="grid gap-2"><Label className="text-base" htmlFor="broker-max">מקסימום נכסים פעילים למתווך</Label><Input className="h-12 text-lg" id="broker-max" type="number" min={min} max={10} value={max} onChange={e=>setMax(Number(e.target.value))} /></div>
      <div className="flex justify-between gap-2"><Button className="text-base" variant="outline" onClick={()=>setOpen(false)}>ביטול</Button><Button className="text-base" disabled={busy||Boolean(current?.lease_until&&Date.parse(current.lease_until)>now)||!validImportParameters(target,min,max)} onClick={()=>{if(current?.status==='running'&&!window.confirm('להפסיק את הייבוא הפעיל ולהתחיל ייבוא חדש מעמוד 1? הטיוטות שכבר נשמרו לא יימחקו.'))return;void action('start');}}><Upload className="h-5 w-5" />{busy?'מתחיל…':'התחלת ייבוא'}</Button></div>
    </div></DialogContent></Dialog>
  </section>;
}
