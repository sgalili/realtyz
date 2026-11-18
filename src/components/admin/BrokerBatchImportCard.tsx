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
import { developerImportPageKind, developerImportUrl } from '@/lib/developerImportUrl';
import { autonomousDeveloperCheckpoint, DEVELOPER_TRANSIENT_RETRY } from '../../../supabase/functions/_shared/developerImportRetry';
import { startContinuousImportRunner } from '@/lib/continuousImportRunner';
import { refreshImportedInventory } from '@/lib/refreshImportedInventory';

const LINKS_KEY = 'toraff-broker-import-links';
const LIMIT_KEY = 'toraff-broker-import-link-limit';
const EXPECTED_PROJECTS_KEY = 'toraff-developer-import-expected-projects';
const validLink = (value: string) => /^https:\/\//i.test(value) && Boolean(agencyUrl(value) || developerImportUrl(value));
const separateLinks = (value: string) => value.replace(/[ \t]+(?=https?:\/\/)/gi, '\n').replace(/\n{2,}/g, '\n');

const stages: Record<string, string> = {
  scanning: 'סריקה ב־Bright Data', enriching: 'איסוף פרטי מתווכים', validating: 'בדיקת מודעות פעילות',
  creating: 'אימות רישיון ויצירת מתווך', importing: 'ייבוא טיוטות', developer_scanning: 'קריאת עמודי יזם ופרויקטים',
  developer_creating: 'יצירת חשבון יזם פעיל ללא הודעות', developer_saving: 'שמירת פרויקטים ויחידות', completed: 'הייבוא הסתיים',
};

export function BrokerBatchImportCard() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(10);
  const [min, setMin] = useState(3);
  const [max, setMax] = useState(10);
  const [links, setLinksState] = useState(() => { try { return localStorage.getItem(LINKS_KEY) ?? ''; } catch { return ''; } });
  const setLinks = (value: string) => { setLinksState(value); try { value ? localStorage.setItem(LINKS_KEY, value) : localStorage.removeItem(LINKS_KEY); } catch { /* storage unavailable */ } };
  const [linkLimit, setLinkLimitState] = useState(() => { const n = Number((() => { try { return localStorage.getItem(LIMIT_KEY); } catch { return null; } })()); return n >= 1 && n <= 10 ? n : 10; });
  const setLinkLimit = (value: number) => { setLinkLimitState(value); try { localStorage.setItem(LIMIT_KEY, String(value)); } catch { /* storage unavailable */ } };
  const [expectedProjects, setExpectedProjectsState] = useState(() => { const n = Number((() => { try { return localStorage.getItem(EXPECTED_PROJECTS_KEY); } catch { return null; } })()); return n >= 1 && n <= 100 ? n : 1; });
  const setExpectedProjects = (value: number) => { setExpectedProjectsState(value); try { localStorage.setItem(EXPECTED_PROJECTS_KEY, String(value)); } catch { /* storage unavailable */ } };
  const linkLines = links.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const developerLinkCount = linkLines.filter(line => Boolean(developerImportUrl(line))).length;
  const invalidCount = linkLines.filter(line => !validLink(line)).length;
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const qc = useQueryClient();
  const { data: jobs } = useQuery({
    queryKey: ['admin-broker-import-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('broker_import_jobs').select('*').order('created_at', { ascending: false }).limit(5);
      if (error) throw error;
      return data;
    },
    refetchInterval: query => query.state.data?.some(job => job.status === 'running' || (job.lease_until && Date.parse(job.lease_until) > Date.now())) ? 4000 : false,
  });
  const current = jobs?.[0];
  // Each saved checkpoint (including final completion) may add inventory for an account.
  useEffect(() => {
    if (current?.id && current.updated_at) void refreshImportedInventory(qc);
  }, [current?.id, current?.updated_at, qc]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!current || current.status === 'completed') return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [current?.status]);

  const action = async (kind: 'start' | 'start_urls' | 'pause' | 'resume' | 'reset_cooldown') => {
    setBusy(true); setError(''); setNotice('');
    try {
      const urls = links.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      const { data, error } = await supabase.functions.invoke('admin-broker-import-queue', {
        body: kind === 'start'
          ? { action: kind, target_brokers: target, min_listings: min, max_listings: max }
          : kind === 'start_urls'
            ? { action: kind, urls, max_listings: linkLimit, expected_projects: expectedProjects }
            : { action: kind, job_id: current?.id },
      });
      if (error) { const details = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null; throw new Error(details?.error ?? 'הבקשה נכשלה'); }
      if (data?.error) throw new Error(data.error);
      await qc.invalidateQueries({ queryKey: ['admin-broker-import-jobs'] });
      if (kind === 'start') setOpen(false);
      if (kind === 'start_urls') {
        setLinks('');
        setNotice(`${data.accepted} קישורים נכנסו לתור${data.developers ? ` · ${data.developers} יזמים` : ''}${data.brokers ? ` · ${data.brokers} מתווכים` : ''}${data.rejected ? ` · ${data.rejected} קישורים לא תקינים דולגו` : ''}`);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'הבקשה נכשלה'); } finally { setBusy(false); }
  };

  const checkpoint = current?.checkpoint as {
    waitUntil?: number; waitReason?: string; rateRetries?: number; brokers?: { listing_urls: string[] }[];
    brokerIndex?: number; listingIndex?: number; page?: number; deal?: string; source?: string; rows?: unknown[];
    enriched?: number; enrichUrls?: string[]; cacheHits?: number; liveFetches?: number; timeoutSkips?: number;
    developerUrls?: string[]; developerIndex?: number; expectedProjects?: number; totalDeveloperUrls?: number; totalBrokerUrls?: number;
    developerWork?: { developer?: { company_name?: string | null }; visitedUrls?: string[]; pendingUrls?: string[]; projects?: unknown[]; expectedProjects?: number };
    developerResults?: { developer_id: string; company_name: string; projects: number; units: number; expected_projects: number }[];
  } | undefined;
  const waitSeconds = Math.max(0, Math.ceil(((checkpoint?.waitUntil ?? 0) - now) / 1000));
  const autonomousDeveloper = autonomousDeveloperCheckpoint(checkpoint);
  useEffect(() => {
    if (!current || current.status !== 'running' || !autonomousDeveloper) return;
    const jobId = current.id;
    return startContinuousImportRunner({
      initialDelay: Math.max(0, (checkpoint?.waitUntil ?? 0) - Date.now()),
      step: async () => {
        const { data, error } = await supabase.functions.invoke('admin-broker-import-queue', { body: { action: 'step', job_id: jobId } });
        if (error || data?.error) throw error ?? new Error(data.error);
        return { done: data?.failed === true, retry_in_ms: data?.retry_in_ms ?? (data?.retry_at ? Math.max(0, data.retry_at - Date.now()) : undefined) };
      },
      refresh: () => qc.invalidateQueries({ queryKey: ['admin-broker-import-jobs'] }),
    });
  }, [current?.id, current?.status, autonomousDeveloper, qc]);
  const waitingForAutomaticRetry = autonomousDeveloper && waitSeconds > 0 && (checkpoint?.waitReason === 'rate_limit' || checkpoint?.waitReason === DEVELOPER_TRANSIENT_RETRY);
  const remaining = checkpoint?.brokers?.slice(checkpoint.brokerIndex ?? 0).reduce((total, broker) => total + broker.listing_urls.length, 0);
  const estimate = current?.step_average_ms && remaining ? Math.ceil(Number(current.step_average_ms) * remaining / 60000) : null;
  const stalled = current?.status === 'running' && !waitingForAutomaticRetry && !(current.lease_until && Date.parse(current.lease_until) > Date.now()) && Date.now() - Date.parse(current.updated_at) > 120_000;
  const developerStage = current?.stage?.startsWith('developer_');
  const scanInfo = developerStage
    ? [`יזם ${(checkpoint?.developerIndex ?? 0) + 1} מתוך ${checkpoint?.totalDeveloperUrls ?? checkpoint?.developerUrls?.length ?? 1}`, checkpoint?.developerWork?.developer?.company_name, `${checkpoint?.developerWork?.visitedUrls?.length ?? 0} עמודים נקראו`, `${checkpoint?.developerWork?.projects?.length ?? 0} פרויקטים נמצאו`, checkpoint?.developerWork?.pendingUrls?.length ? `${checkpoint.developerWork.pendingUrls.length} עמודי פרויקט ממתינים` : null].filter(Boolean).join(' · ')
    : checkpoint && ['scanning', 'enriching'].includes(current?.stage ?? '')
      ? [`${checkpoint.source === 'urls' ? 'קישורים שהודבקו' : checkpoint.source === 'agencies' ? 'משרדי תיווך' : checkpoint.deal === 'rent' ? 'השכרה' : 'מכירה'} · עמוד ${checkpoint.page ?? 1}`, checkpoint.rows?.length ? `${checkpoint.rows.length} כרטיסים נסרקו` : null, checkpoint.enriched ? `${checkpoint.enriched} משרדים נפתחו לאיתור מתווך` : null, checkpoint.enrichUrls?.length ? `${checkpoint.enrichUrls.length} ממתינות` : null, checkpoint.cacheHits ? `${checkpoint.cacheHits} נטענו מהמטמון ללא עלות` : null, checkpoint.timeoutSkips ? `${checkpoint.timeoutSkips} עמודים איטיים דולגו` : null].filter(Boolean).join(' · ')
      : '';
  const newImportButton = <Button className="h-11 shrink-0 px-3 text-base" variant="outline" disabled={busy || (autonomousDeveloper && current?.status === 'running')} onClick={() => { setError(''); setTarget(10); setMin(3); setMax(10); setOpen(true); }}><Upload className="h-5 w-5" />ייבוא חדש</Button>;
  const linkJob = checkpoint?.source === 'urls';
  const entitiesDone = (current?.brokers_done ?? 0) + (current?.developers_done ?? 0);
  const expectedWarnings = checkpoint?.developerResults?.filter(result => result.projects < result.expected_projects) ?? [];

  return <section dir="rtl" className="space-y-4 border-b border-border py-5 text-right">
    <div className="space-y-3 rounded-xl border border-border/70 p-4">
      <h3 className="text-lg font-semibold">ייבוא מתווכים ויזמים מהדבקת קישורים</h3>
      <Textarea dir="ltr" className="min-h-28 text-left text-base" placeholder={'https://www.yad2.co.il/realestate/agency/...\nhttps://www.yad2.co.il/yad1/developers/1000318\nhttps://www.yad2.co.il/yad1/project/16653'} value={links} onChange={event => setLinks(event.target.value)} onPaste={event => { event.preventDefault(); const element = event.currentTarget; const pasted = separateLinks(event.clipboardData.getData('text').trim()); const next = separateLinks(links.slice(0, element.selectionStart) + pasted + '\n' + links.slice(element.selectionEnd)); setLinks(next); }} aria-label="קישורי מתווכים ויזמים, קישור בכל שורה" />
      {linkLines.length > 0 && <ol dir="ltr" className="max-h-56 space-y-1 overflow-y-auto text-left text-sm" aria-label="קישורים ממוספרים">{linkLines.map((line, index) => { const ok = validLink(line); const developer = Boolean(developerImportUrl(line)); return <li key={index} className={`flex items-start gap-2 rounded-md border px-2 py-1 ${ok ? 'border-border/60' : 'border-destructive bg-destructive/10 text-destructive'}`}><span className="shrink-0 font-semibold tabular-nums">{index + 1}.</span><span className="min-w-0 flex-1 break-all">{line}</span>{ok && <span dir="rtl" className="shrink-0 text-xs font-medium">{developer ? developerImportPageKind(line) === 'project' ? 'פרויקט' : 'יזם' : 'מתווך'}</span>}{!ok && <span dir="rtl" className="shrink-0 font-medium">⚠ קישור לא תקין</span>}</li>; })}</ol>}
      {invalidCount > 0 && <p role="alert" className="text-base font-medium text-destructive">{invalidCount} קישורים לא תקינים מסומנים באדום. יש להזין קישור משרד/מתווך, עמוד יזם או קישור ישיר לפרויקט באתר יד2.</p>}
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-row sm:items-end sm:justify-end">
        <div className="space-y-1 sm:w-40 sm:shrink-0"><Label htmlFor="link-limit" className="text-sm">מקס׳ נכסים למתווך</Label><Input id="link-limit" type="number" inputMode="numeric" min={1} max={10} className="h-11 text-base" value={linkLimit} onChange={event => { const value = Math.round(Number(event.target.value)); if (Number.isFinite(value)) setLinkLimit(Math.min(10, Math.max(1, value))); }} /></div>
        <div className="space-y-1 sm:w-44 sm:shrink-0"><Label htmlFor="expected-projects" className="text-sm">פרויקטים צפויים לכל יזם</Label><Input id="expected-projects" type="number" inputMode="numeric" min={1} max={100} className="h-11 text-base" value={expectedProjects} onChange={event => { const value = Math.round(Number(event.target.value)); if (Number.isFinite(value)) setExpectedProjects(Math.min(100, Math.max(1, value))); }} /></div>
        <Button className="col-span-2 h-11 text-base sm:col-span-1" disabled={busy || !links.trim() || (autonomousDeveloper && current?.status === 'running') || Boolean(current?.lease_until && Date.parse(current.lease_until) > now)} onClick={() => { if (current && ['running', 'paused'].includes(current.status) && !window.confirm('להפסיק את הייבוא הפעיל ולהתחיל ייבוא מהקישורים? הטיוטות והפרויקטים שכבר נשמרו לא יימחקו.')) return; void action('start_urls'); }}><Upload className="h-5 w-5" />ייבוא {developerLinkCount ? 'יזמים ומתווכים' : 'מתווכים'} מהקישורים</Button>
      </div>
      {notice && <p className="text-base text-muted-foreground">{notice}</p>}
    </div>
    {!current && <div className="flex items-center justify-end gap-2">{newImportButton}</div>}
    {current && <div role="status" className="space-y-3 rounded-xl border border-border/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2 text-lg font-semibold">{current.status === 'running' && !stalled && <Loader2 className="h-5 w-5 animate-spin" />}{current.status === 'paused' ? 'מושהה · ' : ''}{stages[current.stage] ?? current.stage}</span><span className="text-base text-muted-foreground">{linkJob ? `${entitiesDone}/${current.target_brokers} קישורים` : `${current.brokers_done}/${current.target_brokers} מתווכים`} · {current.listings_done} טיוטות{(current.developers_done ?? 0) > 0 ? ` · ${current.developers_done} יזמים · ${current.projects_done} פרויקטים · ${current.units_done} יחידות` : ''}{current.skipped > 0 ? ` · ${current.skipped} דולגו` : ''}</span></div>
      <Progress className="h-3" value={current.status === 'completed' ? 100 : Math.min(99, (entitiesDone + (developerStage && checkpoint?.developerWork ? (checkpoint.developerWork.visitedUrls?.length ?? 0) / Math.max(1, (checkpoint.developerWork.visitedUrls?.length ?? 0) + (checkpoint.developerWork.pendingUrls?.length ?? 0) + 1) : 0)) / Math.max(1, current.target_brokers) * 100)} />
      {current.status === 'completed' && <p className="text-base font-medium">סיכום: יובאו {current.brokers_done} מתווכים ו־{current.listings_done} נכסים כטיוטות{current.developers_done > 0 ? `; ${current.developers_done} יזמים, ${current.projects_done} פרויקטים ו־${current.units_done} יחידות מפורטות סונכרנו ל״הפרויקטים שלי״` : ''}{current.skipped > 0 ? ` · ${current.skipped} דולגו` : ''}</p>}
      {expectedWarnings.map(result => <p key={result.developer_id} className="text-base font-medium text-warning">ב{result.company_name} נמצאו {result.projects} פרויקטים מתוך {result.expected_projects} צפויים. לא הומצאו פרויקטים חסרים.</p>)}
      {scanInfo && <p className="text-base text-muted-foreground">{scanInfo}</p>}
      {current.status !== 'completed' && waitSeconds > 0 && <p aria-live="polite" className="text-base font-medium text-muted-foreground">{checkpoint?.waitReason === 'rate_limit' ? autonomousDeveloper ? 'מגבלת בקשות (429) · ניסיון חוזר אוטומטי' : 'מגבלת בקשות (429) · הייבוא מושהה · המשך ידני יתאפשר' : checkpoint?.waitReason === DEVELOPER_TRANSIENT_RETRY ? 'תקלה זמנית בחיבור · ניסיון חוזר אוטומטי' : 'השהיית בטיחות בין סריקות למניעת עומס…'} · בעוד {waitSeconds} שניות</p>}
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 text-base text-muted-foreground">{current.status === 'running' && !stalled ? (estimate ? `זמן משוער שנותר: כ־${estimate} דקות` : current.step_average_ms ? `כ־${Math.round(Number(current.step_average_ms) / 1000)} שניות לכל שלב · זמן כולל יוצג לאחר איתור מתווכים` : 'זמן משוער: יופיע לאחר השלמת שלב ראשון') : current.status === 'completed' && current.brokers_done < (checkpoint?.totalBrokerUrls ?? current.target_brokers) ? 'הסריקה הסתיימה עם פחות מתווכים מהיעד' : ''}{checkpoint?.brokers?.length ? ` · מתווך ${(checkpoint.brokerIndex ?? 0) + 1}, מודעה ${(checkpoint.listingIndex ?? 0) + 1}` : ''}</span><div className="flex shrink-0 flex-row items-center gap-2">{!autonomousDeveloper && ['running', 'paused', 'failed'].includes(current.status) && <Button variant="outline" className="h-11 shrink-0 px-3 text-base" disabled={busy || (checkpoint?.waitReason === 'rate_limit' && waitSeconds > 0 && current.status !== 'running')} onClick={() => void action(current.status === 'running' && !stalled ? 'pause' : 'resume')}>{current.status === 'running' && !stalled ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}{current.status === 'running' && !stalled ? 'עצירה' : 'המשך'}</Button>}{newImportButton}</div></div>
      {current.status === 'paused' && current.lease_until && Date.parse(current.lease_until) > Date.now() && <p className="text-base text-muted-foreground">הפעולה שכבר התחילה תסתיים ותישמר; לא תתחיל פעולה נוספת.</p>}
      {stalled && <p role="alert" className="text-base font-medium text-destructive">שגיאת חיבור ל־Bright Data - אנא בדוק את המפתחות או נסה שוב</p>}
      {current.error && <div className="flex flex-wrap items-center gap-3"><p role="alert" className="text-base font-medium text-destructive">{current.error}</p>{!autonomousDeveloper && checkpoint?.waitReason === 'rate_limit' && ['paused', 'failed'].includes(current.status) && <Button variant="outline" className="text-base" disabled={busy || Boolean(current.lease_until && Date.parse(current.lease_until) > now)} onClick={() => { if (window.confirm('לאפס את השהיית 429 ולנקות את השגיאה? ההתקדמות והמטמון יישמרו. האיפוס אינו מסיר מגבלה אצל Bright Data; המשך מוקדם עלול להיתקל שוב ב־429.')) void action('reset_cooldown'); }}><RotateCcw className="h-5 w-5" />איפוס השהיה וניקוי שגיאה</Button>}</div>}
    </div>}
    {error && <p role="alert" className="text-base text-destructive">{error}</p>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="max-w-lg"><DialogHeader><DialogTitle className="text-2xl">ייבוא קבוצת מתווכים</DialogTitle></DialogHeader><div className="grid gap-5">
      <div className="grid gap-2"><Label className="text-base" htmlFor="broker-target">מספר מתווכים רצוי</Label><Input className="h-12 text-lg" id="broker-target" type="number" min={1} max={100} value={target} onChange={event => setTarget(Number(event.target.value))} /></div>
      <div className="grid gap-2"><Label className="text-base" htmlFor="broker-min">מינימום נכסים פעילים למתווך</Label><Input className="h-12 text-lg" id="broker-min" type="number" min={1} max={10} value={min} onChange={event => setMin(Number(event.target.value))} /></div>
      <div className="grid gap-2"><Label className="text-base" htmlFor="broker-max">מקסימום נכסים פעילים למתווך</Label><Input className="h-12 text-lg" id="broker-max" type="number" min={min} max={10} value={max} onChange={event => setMax(Number(event.target.value))} /></div>
      <div className="flex justify-between gap-2"><Button className="text-base" variant="outline" onClick={() => setOpen(false)}>ביטול</Button><Button className="text-base" disabled={busy || Boolean(current?.lease_until && Date.parse(current.lease_until) > now) || !validImportParameters(target, min, max)} onClick={() => { if (current?.status === 'running' && !window.confirm('להפסיק את הייבוא הפעיל ולהתחיל ייבוא חדש מעמוד 1? הטיוטות שכבר נשמרו לא יימחקו.')) return; void action('start'); }}><Upload className="h-5 w-5" />{busy ? 'מתחיל…' : 'התחלת ייבוא'}</Button></div>
    </div></DialogContent></Dialog>
  </section>;
}
