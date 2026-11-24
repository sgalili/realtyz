import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSuperAdminGate } from '@/hooks/useSuperAdminGate';
import { useAdminImportJobs } from '@/hooks/useAdminImportJobs';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Pause, Play, Loader2, ScanSearch, Building2, UserRound, ChevronDown, Repeat2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ImportQuantityInput } from './ImportQuantityInput';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { validImportParameters } from '../../../supabase/functions/_shared/brokerImportQueue';
import { agencyUrl } from '../../../supabase/functions/_shared/yad2Agencies';
import { developerImportUrl } from '@/lib/developerImportUrl';
import { autonomousDeveloperCheckpoint, DEVELOPER_TRANSIENT_RETRY } from '../../../supabase/functions/_shared/developerImportRetry';
import { importJobTargetKind } from '@/lib/importJobMonitoring';
import { refreshImportedInventory } from '@/lib/refreshImportedInventory';
import { importRunTime } from '@/lib/adminImportPresentation';

const LINKS_KEY = 'toraff-broker-import-links';
const LIMIT_KEY = 'toraff-broker-import-link-limit';
const EXPECTED_PROJECTS_KEY = 'toraff-developer-import-expected-projects';
const validLink = (value: string) => /^https:\/\//i.test(value) && Boolean(agencyUrl(value) || developerImportUrl(value));
const separateLinks = (value: string) => value.replace(/[ \t]+(?=https?:\/\/)/gi, '\n').replace(/\n{2,}/g, '\n');

const stages: Record<string, string> = {
  queued: 'ממתין ל־Worker חיצוני',
  scanning: 'סריקה ב־Bright Data', enriching: 'איסוף פרטי מתווכים', validating: 'בדיקת מודעות פעילות',
  creating: 'יצירת מתווך', importing: 'ייבוא טיוטות', developer_discovering: 'איתור יזמים ביד2', developer_scanning: 'קריאת עמודי יזם ופרויקטים',
  developer_creating: 'יצירת חשבון יזם פעיל ללא הודעות', developer_saving: 'שמירת פרויקטים ויחידות', completed: 'הייבוא הסתיים',
};

export function BrokerBatchImportCard({ visible = true }: { visible?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'brokers' | 'developers'>('brokers');
  const [autoDiscovery, setAutoDiscovery] = useState(true);
  const [targetDevelopers, setTargetDevelopers] = useState(5);
  const [target, setTarget] = useState(10);
  const [min, setMin] = useState(3);
  const [max, setMax] = useState(10);
  const [links, setLinksState] = useState(() => { try { return localStorage.getItem(LINKS_KEY) ?? ''; } catch { return ''; } });
  const setLinks = (value: string) => { setLinksState(value); try { value ? localStorage.setItem(LINKS_KEY, value) : localStorage.removeItem(LINKS_KEY); } catch { /* storage unavailable */ } };
  const [linkLimit, setLinkLimitState] = useState(() => { const n = Number((() => { try { return localStorage.getItem(LIMIT_KEY); } catch { return null; } })()); return n >= 1 && n <= 50 ? n : 10; });
  const setLinkLimit = (value: number) => { setLinkLimitState(value); try { localStorage.setItem(LIMIT_KEY, String(value)); } catch { /* storage unavailable */ } };
  const [expectedProjects, setExpectedProjectsState] = useState(() => { const n = Number((() => { try { return localStorage.getItem(EXPECTED_PROJECTS_KEY); } catch { return null; } })()); return n >= 1 && n <= 100 ? n : 1; });
  const setExpectedProjects = (value: number) => { setExpectedProjectsState(value); try { localStorage.setItem(EXPECTED_PROJECTS_KEY, String(value)); } catch { /* storage unavailable */ } };
  const linkLines = links.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const mismatchedCount = linkLines.filter(line => validLink(line) && (mode === 'developers' ? !developerImportUrl(line) : !agencyUrl(line))).length;
  const invalidCount = linkLines.filter(line => !validLink(line)).length;
  // Pasted links only drive the import while auto-discovery is off; while it is on the paste area is hidden and ignored.
  const useLinks = !autoDiscovery && links.trim().length > 0;
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [repeatBusy, setRepeatBusy] = useState(false);
  const [repeatDraft, setRepeatDraft] = useState(false);
  const [error, setError] = useState('');
  const [repeatConfirm, setRepeatConfirm] = useState(false);
  const qc = useQueryClient();
  const { data: jobs } = useAdminImportJobs();
  const current = jobs?.[0];
  const gate = useSuperAdminGate();
  const repeatEnabled = current?.repeat_enabled ?? repeatDraft;
  const setRepeat = async (enabled: boolean) => {
    if (!current) { setRepeatDraft(enabled); return; }
    setRepeatBusy(true); setError('');
    try {
      const { error: repeatError } = await supabase.rpc('set_import_repeat', { _id: current.id, _enabled: enabled });
      if (repeatError) throw repeatError;
      setRepeatDraft(enabled);
      await qc.invalidateQueries({ queryKey: ['admin-broker-import-jobs'] });
    } catch { setError('לא ניתן לעדכן חזרתיות כרגע. ההתקדמות נשמרה.'); }
    finally { setRepeatBusy(false); }
  };
  const lastCompleted = useQuery({ queryKey: ['admin-import-last-completed', gate.uid, current?.updated_at], enabled: gate.enabled, queryFn: async () => {
    const { data, error } = await supabase.from('broker_import_jobs').select('updated_at').eq('status', 'completed').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  } });
  const completed = lastCompleted.data ?? jobs?.find(job => job.status === 'completed');
  const [statusExpanded, setStatusExpanded] = useState(false);
  const savedCounts = useQuery({ queryKey: ['admin-import-broker-counts', gate.uid, current?.id, current?.updated_at], enabled: gate.enabled && statusExpanded && Boolean(current?.id), queryFn: async () => {
    if (!current) return [];
    const { data, error: countError } = await supabase.rpc('get_import_broker_property_counts', { _id: current.id });
    if (countError) throw countError;
    return data;
  } });
  useEffect(() => { setStatusExpanded(false); }, [current?.id]);
  const toggleStatus = () => {
    if (!current) return;
    const expanded = !statusExpanded;
    setStatusExpanded(expanded);
  };
  // Each saved checkpoint (including final completion) may add inventory for an account.
  useEffect(() => {
    if (current?.id && current.updated_at) void refreshImportedInventory(qc);
  }, [current?.id, current?.updated_at, qc]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!current || current.status === 'completed') return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [current?.status]);

  const action = async (kind: 'start' | 'start_urls' | 'start_auto_developers' | 'pause' | 'resume') => {
    setBusy(true); setError(''); setNotice('');
    try {
      const urls = links.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      const { data, error } = await supabase.functions.invoke('admin-broker-import-queue', {
        body: kind === 'start_auto_developers' ? { action: kind, target_developers: targetDevelopers, max_projects: expectedProjects } : kind === 'start'
          ? { action: kind, target_brokers: target, min_listings: min, max_listings: max }
          : kind === 'start_urls'
            ? { action: kind, urls, ...(mode === 'developers' ? { max_projects: expectedProjects } : { max_listings: linkLimit }) }
            : { action: kind, job_id: current?.id },
      });
      if (error) { const details = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null; throw new Error(details?.error ?? 'הבקשה נכשלה'); }
      if (data?.error) throw new Error(data.error);
      if (data?.job_id && repeatEnabled && !useLinks) {
        const { error: repeatError } = await supabase.rpc('set_import_repeat', { _id: data.job_id, _enabled: true });
        if (repeatError) { setNotice('הייבוא התחיל ללא חזרתיות. ניתן להפעיל אותה בשורת הסטטוס.'); }
      }
      await qc.invalidateQueries({ queryKey: ['admin-broker-import-jobs'] });
      if (kind !== 'pause' && kind !== 'resume') setOpen(false);
      if (kind === 'start_urls') {
        setLinks('');
        setNotice(`${data.accepted} קישורים נכנסו לתור${data.developers ? ` · ${data.developers} יזמים` : ''}${data.brokers ? ` · ${data.brokers} מתווכים` : ''}${data.rejected ? ` · ${data.rejected} קישורים לא תקינים דולגו` : ''}`);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'הבקשה נכשלה'); } finally { setBusy(false); }
  };

  const checkpoint = current?.checkpoint as {
    execution?: string; autoContinue?: boolean; pauseReason?: string | null; failedSourceVersion?: number; lastError?: { message?: string; status?: number | null; at?: string; stage?: string }; autoDevelopers?: boolean; workerId?: string; workerHeartbeatAt?: string; waitUntil?: number; waitReason?: string; rateRetries?: number; transientRetries?: number; brokers?: { listing_urls: string[] }[];
    brokerIndex?: number; listingIndex?: number; page?: number; deal?: string; source?: string; rows?: unknown[];
    enriched?: number; enrichUrls?: string[]; cacheHits?: number; liveFetches?: number; timeoutSkips?: number;
    developerUrls?: string[]; developerIndex?: number; expectedProjects?: number; totalDeveloperUrls?: number; totalBrokerUrls?: number;
    developerWork?: { developer?: { company_name?: string | null }; visitedUrls?: string[]; pendingUrls?: string[]; projects?: unknown[]; expectedProjects?: number };
    developerResults?: { developer_id: string; company_name: string; projects: number; units: number; expected_projects: number }[];
  } | undefined;
  const waitSeconds = Math.max(0, Math.ceil(((checkpoint?.waitUntil ?? 0) - now) / 1000));
  const autonomousDeveloper = autonomousDeveloperCheckpoint(checkpoint);
  const waitingForAutomaticRetry = waitSeconds > 0 && (checkpoint?.waitReason === 'rate_limit' || checkpoint?.waitReason === DEVELOPER_TRANSIENT_RETRY);
  const remaining = checkpoint?.brokers?.slice(checkpoint.brokerIndex ?? 0).reduce((total, broker) => total + broker.listing_urls.length, 0);
  const estimate = current?.step_average_ms && remaining ? Math.ceil(Number(current.step_average_ms) * remaining / 60000) : null;
  const externalWorker = checkpoint?.execution === 'external';
  const stalled = current?.status === 'running' && current.stage !== 'queued' && !waitingForAutomaticRetry && !(current.lease_until && Date.parse(current.lease_until) > Date.now()) && now - Date.parse(current.updated_at) > 120_000;
  const developerStage = current?.stage?.startsWith('developer_');
  const scanInfo = developerStage
    ? [`יזם ${(checkpoint?.developerIndex ?? 0) + 1} מתוך ${checkpoint?.totalDeveloperUrls ?? checkpoint?.developerUrls?.length ?? 1}`, checkpoint?.developerWork?.developer?.company_name, `${checkpoint?.developerWork?.visitedUrls?.length ?? 0} עמודים נקראו`, `${checkpoint?.developerWork?.projects?.length ?? 0} פרויקטים נמצאו`, checkpoint?.developerWork?.pendingUrls?.length ? `${checkpoint.developerWork.pendingUrls.length} עמודי פרויקט ממתינים` : null].filter(Boolean).join(' · ')
    : checkpoint && ['scanning', 'enriching'].includes(current?.stage ?? '')
      ? [`${checkpoint.source === 'urls' ? 'קישורים שהודבקו' : checkpoint.source === 'agencies' ? 'משרדי תיווך' : checkpoint.deal === 'rent' ? 'השכרה' : 'מכירה'} · עמוד ${checkpoint.page ?? 1}`, checkpoint.rows?.length ? `${checkpoint.rows.length} כרטיסים נסרקו` : null, checkpoint.enriched ? `${checkpoint.enriched} משרדים נפתחו לאיתור מתווך` : null, checkpoint.enrichUrls?.length ? `${checkpoint.enrichUrls.length} ממתינות` : null, checkpoint.cacheHits ? `${checkpoint.cacheHits} נטענו מהמטמון ללא עלות` : null, checkpoint.timeoutSkips ? `${checkpoint.timeoutSkips} עמודים איטיים דולגו` : null].filter(Boolean).join(' · ')
      : '';
  useEffect(() => {
    const openNewImport = () => {
      if (busy || (autonomousDeveloper && current?.status === 'running')) return;
      setError(''); setTarget(10); setMin(3); setMax(10); setOpen(true);
    };
    window.addEventListener('admin-broker-import:new', openNewImport);
    return () => window.removeEventListener('admin-broker-import:new', openNewImport);
  }, [busy, autonomousDeveloper, current?.status]);
  const targetKind = importJobTargetKind(checkpoint);
  const entitiesDone = (current?.brokers_done ?? 0) + (current?.developers_done ?? 0);
  const expectedWarnings = checkpoint?.developerResults?.filter(result => result.projects < result.expected_projects) ?? [];

  const runActive = Boolean(current && ['running', 'paused'].includes(current.status));
  const automaticallyRecovering = current?.status === 'paused' && checkpoint?.autoContinue === true && checkpoint.pauseReason !== 'user';
  const canToggle = Boolean(current && !automaticallyRecovering && (current.status === 'running' || (current.status === 'paused' && checkpoint?.pauseReason === 'user')));
  const stopControl = canToggle ? <Button variant="ghost" size="icon" className="h-12 w-12 shrink-0 border-0 bg-transparent shadow-none" aria-label={automaticallyRecovering ? 'המשך אוטומטי' : current?.status === 'running' ? 'עצירה' : 'המשך'} title={automaticallyRecovering ? 'המשך אוטומטי' : current?.status === 'running' ? 'עצירה' : 'המשך'} disabled={!canToggle || busy || (checkpoint?.waitReason === 'rate_limit' && waitSeconds > 0 && current?.status !== 'running')} onClick={() => void action(current?.status === 'running' ? 'pause' : 'resume')}>{automaticallyRecovering ? <Loader2 className="!h-7 !w-7 animate-spin" /> : current?.status === 'running' ? <Pause className="!h-7 !w-7" /> : <Play className="!h-7 !w-7" />}</Button> : null;
  const importButton = <Button variant="ghost" size="icon" className="h-12 w-12 shrink-0 border-0 bg-transparent shadow-none" aria-label="איתור וייבוא" title="איתור וייבוא" onClick={() => { setError(''); setTarget(10); setMin(3); setMax(10); setOpen(true); }}><ScanSearch className="!h-7 !w-7" /></Button>;
  const repeatButton = <Button type="button" variant="ghost" size="icon" className={`h-10 w-10 shrink-0 border-0 bg-transparent shadow-none hover:bg-transparent ${repeatEnabled ? 'text-foreground' : 'text-muted-foreground'}`} aria-label={repeatEnabled ? 'חזרתיות פעילה' : 'חזרתיות כבויה'} title={repeatEnabled ? 'חזרתיות פעילה' : 'חזרתיות כבויה'} aria-pressed={repeatEnabled} disabled={repeatBusy || !gate.enabled} onClick={() => setRepeatConfirm(true)}>{repeatBusy ? <Loader2 className="!h-6 !w-6 animate-spin" /> : <Repeat2 className="!h-6 !w-6" />}</Button>;
  const repeatDialog = <AlertDialog open={repeatConfirm} onOpenChange={setRepeatConfirm}><AlertDialogContent dir="rtl" className="text-right">
    <AlertDialogHeader><AlertDialogTitle className="text-right">{repeatEnabled ? 'לכבות חזרתיות?' : 'להפעיל חזרתיות?'}</AlertDialogTitle>
      <AlertDialogDescription className="text-right text-base">{repeatEnabled ? 'הריצה הנוכחית תסתיים כרגיל, ולא תתחיל ריצה חוזרת נוספת.' : 'בסיום כל ריצה תתחיל ריצה חדשה עם אותן הגדרות, עד שתכבה את החזרתיות. ההתקדמות הקיימת נשמרת.'}</AlertDialogDescription></AlertDialogHeader>
    <AlertDialogFooter className="flex-row justify-between gap-2 sm:justify-between"><AlertDialogCancel className="mt-0">ביטול</AlertDialogCancel><AlertDialogAction onClick={() => void setRepeat(!repeatEnabled)}>{repeatEnabled ? 'כיבוי חזרתיות' : 'הפעלת חזרתיות'}</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>;
  return <section dir="rtl" className="text-right">
    <div hidden={!visible} className="space-y-2 py-2">
    {notice && <p className="text-base text-muted-foreground">{notice}</p>}
    <div role="status" className="space-y-2 rounded-md border border-border/70 p-2">
      {completed && <p className="text-xs text-muted-foreground">ייבוא אחרון · {importRunTime(completed.updated_at)}</p>}
      {current ? <div className="flex items-start gap-2"><Button variant="ghost" type="button" aria-label={statusExpanded ? 'כיווץ פרטי הייבוא' : 'הרחבת פרטי הייבוא'} aria-expanded={statusExpanded} aria-controls="import-status-details" className="h-auto min-w-0 flex-1 flex-col items-start gap-1 whitespace-normal p-0 text-right hover:bg-transparent" onClick={toggleStatus}><span className="flex min-w-0 items-center gap-2 whitespace-nowrap text-base font-semibold sm:text-lg"><ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${statusExpanded ? 'rotate-180' : ''}`} />{current.status === 'running' && !stalled && <Loader2 className="h-5 w-5 shrink-0 animate-spin" />}<span className="min-w-0 truncate">{current.status === 'paused' ? 'מושהה · ' : ''}{stages[current.stage] ?? current.stage}</span></span><span className="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-sm tabular-nums text-muted-foreground sm:text-base">{[targetKind === 'developers' ? `${current.developers_done ?? 0}/${current.target_brokers} יזמים` : targetKind === 'links' ? `${entitiesDone}/${current.target_brokers} קישורים` : `${current.brokers_done}/${current.target_brokers} מתווכים`, `${current.listings_done} טיוטות`, ...((current.developers_done ?? 0) > 0 ? [`${current.developers_done} יזמים`, `${current.projects_done} פרויקטים`, `${current.units_done} יחידות`] : []), ...(current.skipped > 0 ? [`${current.skipped} דולגו`] : [])].map(item => <span key={item} className="whitespace-nowrap">{item}</span>)}</span></Button><div className="flex shrink-0 items-center gap-1">{stopControl}{repeatButton}{importButton}</div></div> : <div className="flex items-center gap-2"><span className="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap text-base font-semibold sm:text-lg"><ScanSearch className="h-5 w-5 shrink-0 text-muted-foreground" /><span className="truncate">סטטוס ייבוא</span><span className="truncate text-sm font-normal text-muted-foreground sm:text-base">· אין ייבוא פעיל</span></span><div className="flex shrink-0 items-center gap-1">{stopControl}{repeatButton}{importButton}</div></div>}
      {current && statusExpanded && <div id="import-status-details" className="space-y-3">
      {targetKind === 'brokers' && <p className="text-base text-muted-foreground">תקרת הריצה: עד {current.max_listings} נכסים למתווך</p>}
      <details><summary className="cursor-pointer text-sm text-muted-foreground">מתווכים שיובאו ({savedCounts.data?.length ?? 0})</summary><div className="max-h-48 space-y-1 overflow-y-auto">{savedCounts.data?.map(broker => <p key={broker.broker_id} className="text-sm text-muted-foreground">{((current.checkpoint as { brokerResults?: { broker_id: string; full_name?: string }[] })?.brokerResults ?? []).find(item => item.broker_id === broker.broker_id)?.full_name ?? 'מתווך'} · {broker.saved_count} נכסים נשמרו</p>)}</div></details>
      {savedCounts.isError && <p role="alert" className="text-sm text-muted-foreground">ספירת הנכסים אינה זמינה כרגע</p>}
      {checkpoint?.lastError?.message && current.status !== 'completed' && !current.error && <p role="alert" className="break-words text-sm font-medium text-destructive sm:text-base">שגיאה אחרונה{checkpoint.lastError.status ? ` (${checkpoint.lastError.status})` : ''}{checkpoint.lastError.at ? ` · ${new Date(checkpoint.lastError.at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : ''}: {checkpoint.lastError.message}</p>}
      <Progress className="h-3" value={current.status === 'completed' ? 100 : Math.min(99, (entitiesDone + (developerStage && checkpoint?.developerWork ? (checkpoint.developerWork.visitedUrls?.length ?? 0) / Math.max(1, (checkpoint.developerWork.visitedUrls?.length ?? 0) + (checkpoint.developerWork.pendingUrls?.length ?? 0) + 1) : 0)) / Math.max(1, current.target_brokers) * 100)} />
      {current.status === 'completed' && <ImportSummary checkpoint={checkpoint} job={current} />}
      {(checkpoint?.failedSourceVersion ?? 0) > 0 && <p className="text-base text-muted-foreground">{checkpoint?.failedSourceVersion === 1 ? 'פריט אחד נכשל ודולג' : `${checkpoint?.failedSourceVersion} פריטים נכשלו ודולגו`} לאחר ניסיונות מוגבלים{current.status === 'running' ? ' · הייבוא ממשיך אוטומטית' : ''}</p>}
      {expectedWarnings.map(result => <p key={result.developer_id} className="text-base font-medium text-warning">ב{result.company_name} נמצאו {result.projects} פרויקטים מתוך {result.expected_projects} צפויים. לא הומצאו פרויקטים חסרים.</p>)}
      {scanInfo && <p className="text-base text-muted-foreground">{scanInfo}</p>}
      {current.status !== 'completed' && waitSeconds > 0 && <p aria-live="polite" className="text-base font-medium text-muted-foreground">{checkpoint?.waitReason === 'rate_limit' ? `מגבלת בקשות (429) · ניסיון חוזר אוטומטי ${checkpoint?.rateRetries ?? 1}` : checkpoint?.waitReason === DEVELOPER_TRANSIENT_RETRY ? `תקלה זמנית בחיבור · ניסיון חוזר אוטומטי ${checkpoint?.transientRetries ?? 1}` : 'השהיית בטיחות בין סריקות למניעת עומס…'} · בעוד {waitSeconds} שניות</p>}
      {current.status === 'running' && waitSeconds === 0 && (checkpoint?.waitReason === 'rate_limit' || checkpoint?.waitReason === DEVELOPER_TRANSIENT_RETRY) && <p aria-live="polite" className="text-base font-medium text-muted-foreground">זמן ההמתנה הסתיים · ממשיך כעת…</p>}
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 text-base text-muted-foreground">{current.status === 'running' && !stalled ? (estimate ? `זמן משוער שנותר: כ־${estimate} דקות` : current.step_average_ms ? `כ־${Math.round(Number(current.step_average_ms) / 1000)} שניות לכל שלב · זמן כולל יוצג לאחר איתור מתווכים` : 'זמן משוער: יופיע לאחר השלמת שלב ראשון') : current.status === 'completed' && targetKind === 'brokers' && current.brokers_done < (checkpoint?.totalBrokerUrls ?? current.target_brokers) ? 'הסריקה הסתיימה עם פחות מתווכים מהיעד' : ''}{checkpoint?.brokers?.length ? ` · מתווך ${(checkpoint.brokerIndex ?? 0) + 1}, מודעה ${(checkpoint.listingIndex ?? 0) + 1}` : ''}</span><div className="flex shrink-0 flex-row items-center gap-2"></div></div>
      {current.status === 'paused' && current.lease_until && Date.parse(current.lease_until) > Date.now() && <p className="text-base text-muted-foreground">הפעולה שכבר התחילה תסתיים ותישמר; לא תתחיל פעולה נוספת.</p>}
      {stalled && <p role="alert" className="text-base font-medium text-destructive">{externalWorker ? 'לא התקבל עדכון מה־Worker החיצוני. ההתקדמות נשמרה; הייבוא יתחדש אוטומטית כשהחיבור יחזור, ללא לחיצה על המשך.' : 'לא התקבל עדכון מהסריקה. ההתקדמות נשמרה וההמשך יופעל אוטומטית.'}</p>}
      {current.error && <p role="alert" className="text-base font-medium text-destructive">{current.error}</p>}
      {error && !open && <p role="alert" className="text-base text-destructive">{error}</p>}
      </div>}
    </div>
    </div>
    {error && !open && !statusExpanded && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {repeatEnabled && (current?.checkpoint as { source?: string; autoDevelopers?: boolean })?.source === 'urls' && !(current?.checkpoint as { autoDevelopers?: boolean })?.autoDevelopers && <p className="text-sm text-muted-foreground">רשימת הקישורים תסתיים ללא סריקה נוספת. חזרתיות זמינה באיתור אוטומטי.</p>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="max-h-[85dvh] max-w-lg overflow-y-auto"><DialogHeader><DialogTitle className="text-2xl">איתור וייבוא</DialogTitle></DialogHeader>
      <Tabs dir="rtl" value={mode} onValueChange={value => { if (value === 'brokers' || value === 'developers') { setMode(value); setError(''); } }}>
        <TabsList className="grid h-12 w-full grid-cols-2"><TabsTrigger value="brokers" className="gap-2 text-base"><UserRound className="h-4 w-4" />מתווכים</TabsTrigger><TabsTrigger value="developers" className="gap-2 text-base"><Building2 className="h-4 w-4" />יזמים</TabsTrigger></TabsList>
      </Tabs>
      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3"><Label htmlFor="auto-discovery" className="text-base">איתור אוטומטי מיד 2</Label><Switch id="auto-discovery" checked={autoDiscovery} onCheckedChange={setAutoDiscovery} /></div>
        {!autoDiscovery && <>
          <Label htmlFor="import-links" className="text-base">{mode === 'developers' ? 'קישורי יזמים או פרויקטים ביד2' : 'קישורי מתווכים ביד2'}</Label>
          <Textarea id="import-links" dir="ltr" className="min-h-20 text-left text-base" placeholder={mode === 'developers' ? 'https://www.yad2.co.il/yad1/developers/1000318' : 'https://www.yad2.co.il/realestate/agency/...'} value={links} onChange={event => setLinks(event.target.value)} onPaste={event => { event.preventDefault(); const element = event.currentTarget; const pasted = separateLinks(event.clipboardData.getData('text').trim()); setLinks(separateLinks(links.slice(0, element.selectionStart) + pasted + '\n' + links.slice(element.selectionEnd))); }} />
          {(invalidCount > 0 || mismatchedCount > 0) && <p role="alert" className="text-base text-destructive">יש להזין קישורים תקינים התואמים ללשונית שנבחרה.</p>}
        </>}
        {mode === 'developers' ? <>{autoDiscovery && <CountField id="developer-target" label="מספר יזמים לאיתור" value={targetDevelopers} min={1} max={100} onChange={setTargetDevelopers} />}
          <CountField id="project-limit" label="עד כמה פרויקטים ליזם" value={expectedProjects} min={1} max={100} onChange={setExpectedProjects} />
        </> : <>
          {autoDiscovery && <><CountField id="broker-target" label="מספר מתווכים רצוי" value={target} min={1} max={100} onChange={setTarget} /><CountField id="broker-min" label="מינימום נכסים פעילים למתווך" value={min} min={1} max={max} onChange={setMin} /></>}
          <CountField id="broker-max" label="מספר נכסים לייבוא" value={useLinks ? linkLimit : max} min={useLinks ? 1 : min} max={50} onChange={useLinks ? setLinkLimit : setMax} />
        </>}
        {error && <p role="alert" className="text-base text-destructive">{error}</p>}
        <div className="flex justify-between gap-2"><Button className="text-base" variant="outline" onClick={() => setOpen(false)}>ביטול</Button><div className="flex items-center gap-1">{!useLinks && repeatButton}<Button className="text-base" disabled={busy || (!runActive && Boolean(current?.lease_until && Date.parse(current.lease_until) > now)) || (useLinks && (invalidCount > 0 || mismatchedCount > 0)) || (!autoDiscovery && !links.trim()) || (mode === 'brokers' && autoDiscovery && !validImportParameters(target, min, max))} onClick={async () => { if (runActive && !window.confirm('להפסיק את הייבוא הפעיל ולהתחיל ייבוא חדש? הטיוטות והפרויקטים שכבר נשמרו לא יימחקו.')) return; if (current?.status === 'running') { setBusy(true); const { data, error } = await supabase.functions.invoke('admin-broker-import-queue', { body: { action: 'pause', job_id: current.id } }); setBusy(false); if (error || data?.error) { setError('לא ניתן היה לעצור את הייבוא הפעיל; ייבוא חדש לא התחיל'); return; } } void action(useLinks ? 'start_urls' : mode === 'developers' ? 'start_auto_developers' : 'start'); }}><ScanSearch className="h-5 w-5" />{busy ? 'מתחיל…' : runActive ? 'עצור והתחל' : 'התחלת ייבוא'}</Button></div></div>
      </div>
    </DialogContent></Dialog>
    {repeatDialog}
  </section>;
}

// One quantity control on the same row as its title.
function CountField({ id, label, value, min, max, onChange }: { id: string; label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <div className="flex items-center justify-between gap-3">
    <Label className="text-base" htmlFor={id}>{label}</Label>
    <div className="w-36 shrink-0"><ImportQuantityInput id={id} value={value} min={min} max={max} onChange={onChange} /></div>
  </div>;
}

// Completion summary: names only what this run actually imported, and only for the requested entity type.
function ImportSummary({ checkpoint, job }: { checkpoint: any; job: any }) {
  const wantsDevelopers = Boolean(checkpoint?.autoDevelopers || (checkpoint?.totalDeveloperUrls ?? 0) > 0);
  const wantsBrokers = checkpoint?.source !== 'urls' || (checkpoint?.totalBrokerUrls ?? 0) > 0;
  const developers = ((checkpoint?.developerResults ?? []) as any[]).filter(r => r.status !== 'failed' && r.company_name);
  const brokers = ((checkpoint?.brokerResults ?? []) as any[]).filter(r => r.full_name || r.office_name);
  const skipped = ((checkpoint?.skippedExisting ?? []) as any[]).filter(x => (x.kind === 'developer' ? wantsDevelopers : wantsBrokers));
  const names = (list: string[]) => list.join('، ');
  return <details><summary className="cursor-pointer truncate text-sm text-muted-foreground">יובאו {brokers.length} מתווכים ו־{developers.length} יזמים · {job.listings_done} טיוטות</summary><div className="space-y-1 text-base">
    {wantsDevelopers && <p className="font-medium">{developers.length ? `יובאו ${developers.length} יזמים: ${names(developers.map(r => `${r.company_name} (${r.projects} פרויקטים, ${r.units} דירות)`))}` : 'לא יובאו יזמים חדשים בתהליך זה'}</p>}
    {wantsBrokers && <p className="font-medium">{brokers.length ? `יובאו ${brokers.length} מתווכים: ${names(brokers.map(r => r.full_name ? `${r.full_name}${r.office_name ? ` (${r.office_name})` : ''}` : r.office_name))} · ${job.listings_done} נכסים כטיוטות` : 'לא יובאו מתווכים חדשים בתהליך זה'}</p>}
    {skipped.length > 0 && <p className="text-muted-foreground">דולגו כי כבר קיימים במערכת: {names(skipped.map(x => x.name).filter(Boolean))}</p>}
  </div></details>;
}
