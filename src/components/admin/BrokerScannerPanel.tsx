import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownWideNarrow, Download, Loader2, Play, Unplug } from 'lucide-react';
import { useNavigate } from '@/lib/router-compat';
import { saveSuperAdminViewState } from '@/lib/superAdminViewState';
import { BulkBrokerWhatsAppScan } from './BulkBrokerWhatsAppScan';
import { BulkBrokerRegistryRecheck } from './BulkBrokerRegistryRecheck';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSuperAdminGate } from '@/hooks/useSuperAdminGate';
import { brokerWhatsAppRequest } from '@/lib/brokerWhatsAppRequest';
import { brokerUserError } from '../../../supabase/functions/_shared/brokerRecovery';
import { ScannerActionConfirm } from './ScannerActionConfirm';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import type { DiscoveryRowState, DiscoverySortMode } from '@/lib/brokerDiscoveryPriority';
import { scannerDelayReason, scannerFailureReason, scannerWorkerState, workerStateLabels } from '@/lib/brokerScannerState';
import { BrokerGenderSort } from './BrokerGenderSort';
import { useAdminImportJobs } from '@/hooks/useAdminImportJobs';
import { importEntityProgress, pendingRedLicenses, type WaitingLicense } from '@/lib/brokerAdminMetrics';

export type ScannerSettings = { scanner_phone?: string | null; enabled: boolean; paused: boolean; pause_reason: string | null; daily_cap: number; jitter_min_seconds: number; jitter_max_seconds: number; start_hour: number; end_hour: number; error_threshold: number; max_outstanding?: number; next_send_at?: string | null; connected?: boolean; webhook_ready?: boolean; worker_seen_at?: string | null; worker_rejected_at?: string | null; config_checked_at?: string | null };
export type ScannerStatus = { overview?: { done: number; total: number; rows: DiscoveryRowState[] }; batch_progress?: { done: number; total: number } | null; settings: ScannerSettings; credentials_ready: boolean; used_today: number; manual_replies: number; queue_ahead?: number; outstanding?: boolean; outstanding_until?: string | null; job?: { id: string; status: string; last_error: string | null; reply_deadline?: string | null; next_source_at?: string | null; lease_until?: string | null; send_reserved_at?: string | null } | null; contact?: { whatsapp_phone: string } | null };
export async function scannerCall(body: Record<string, unknown>) {
  return brokerWhatsAppRequest<ScannerStatus & { ok?: boolean; reason?: string; error?: string }>('broker-whatsapp-scanner', body);
}
const reasons: Record<string, string> = { not_configured: 'טרם הוגדר', configuration_changed: 'ההגדרות השתנו — יש לבדוק ולהפעיל', user_paused: 'הושהה ידנית', scanner_disconnected: 'הקו מנותק', scanner_webhook_not_configured: 'הוובהוק אינו מוגדר בקו', scanner_phone_not_dedicated: 'הקו אינו ייעודי', scanner_instance_in_use_by_workspace: 'הקו כבר משמש חשבון אחר', scanner_credentials_missing: 'חסרים פרטי קו', scanner_phone_is_broker_contact: 'מספר הקו שמור כמספר של מתווך', save_settings_first: 'יש לשמור הגדרות תחילה', scanner_not_ready: 'הקו אינו מוכן' };

export function BrokerScannerPanel({ prioritySort = 'off', onPrioritySort }: { prioritySort?: DiscoverySortMode; onPrioritySort?: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const openImport = () => { saveSuperAdminViewState({ section: 'import', history: 'imports', importStatus: { jobId: '*', expanded: true } }); navigate('/super-admin?section=import&history=imports'); window.setTimeout(() => window.dispatchEvent(new Event('admin-import:expand-status')), 300); };
  const gate = useSuperAdminGate();
  const status = useQuery({ queryKey: ['broker-wa-scanner', gate.uid], enabled: gate.enabled, retry: false, staleTime: 15000, queryFn: () => scannerCall({ action: 'status' }), refetchInterval: 30000 });
  const waiting = useQuery({ queryKey: ['broker-contact-queue', gate.uid], enabled: gate.enabled, staleTime: 30000, queryFn: () => brokerWhatsAppRequest<{ brokers: WaitingLicense[] }>('admin-broker-contact', { action: 'list' }), refetchInterval: 60000 });
  const imports = useAdminImportJobs();
  const importProgress = importEntityProgress(imports.data);
  const redCount = waiting.data ? pendingRedLicenses(waiting.data.brokers) : null;
  const s = status.data?.settings;
  // Silent WhatsApp profile-photo fetch for brokers with a saved number and no photo yet.
  const avatarRun = useRef(false);
  const missingAvatars = (waiting.data?.brokers ?? []).filter(b => (b as { whatsapp_phone?: string | null; avatar_url?: string | null }).whatsapp_phone && !(b as { avatar_url?: string | null }).avatar_url).length;
  useEffect(() => {
    if (!gate.enabled || avatarRun.current || !missingAvatars) return;
    avatarRun.current = true;
    void (async () => {
      for (let i = 0; i < 20; i++) {
        const r = await brokerWhatsAppRequest<{ updated?: number; none?: number; remaining?: number }>('admin-broker-contact', { action: 'wa_avatars' }).catch(() => null);
        if (r?.updated) void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] });
        if (!r || !r.remaining || !((r.updated ?? 0) + (r.none ?? 0))) break;
      }
      window.setTimeout(() => { avatarRun.current = false; }, 60000);
    })();
  }, [gate.enabled, waiting.data, missingAvatars, qc]);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<'pause' | 'resume' | 'configure' | null>(null);
  const [draft, setDraft] = useState<Partial<ScannerSettings>>({});
  const value = (key: keyof ScannerSettings) => Number(draft[key] ?? s?.[key] ?? 0);
  // Last action result stays visible on the card, not only as a passing toast.
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const report = (ok: boolean, text: string) => { setResult({ ok, text }); (ok ? toast.success : toast.error)(text); };
  const act = useMutation({ mutationFn: (body: Record<string, unknown>) => scannerCall(body), onMutate: () => setResult(null), onSuccess: (data, body) => {
    setConfirm(null);
    if (data.ok === false) report(false, `${reasons[data.reason ?? ''] ?? brokerUserError(data.error ?? data.reason, 'הקו אינו מוכן')}${body.action === 'resume' || body.action === 'test_connection' ? '; הסריקה לא הופעלה' : ''}`);
    else if (body.action === 'configure') { setDraft({}); report(true, 'נשמר. הקו מושהה עד בדיקה והפעלה'); }
    else if (body.action === 'test_connection') report(true, s?.enabled && !s.paused ? 'החיבור תקין והקו פעיל' : 'החיבור תקין. הקו עדיין מושהה — לחצו על סמל התקע כדי להפעיל');
    else report(true, body.action === 'pause' ? 'הסריקה הושהתה' : 'הסריקה פעילה');
    void qc.invalidateQueries({ queryKey: ['broker-wa-scanner'] });
    void qc.invalidateQueries({ queryKey: ['broker-wa-scanner-job'] });
  }, onError: (e: Error) => report(false, e.message) });
  if (status.isLoading) return <Loader2 className="h-4 w-4 animate-spin" aria-label="טוען קו סריקה" />;
  if (!s) return <p className="text-sm text-destructive">לא ניתן לקרוא את מצב קו הסריקה</p>;
  const field = (key: keyof ScannerSettings, label: string, min: number, max: number) => <label className="flex items-center gap-1 text-sm">{label}<Input type="number" min={min} max={max} className="h-8 w-16" value={value(key)} onChange={e => setDraft(d => ({ ...d, [key]: Number(e.target.value) }))} /></label>;
  const active = s.enabled && !s.paused;
  const ready = !!(s.connected && s.webhook_ready && status.data?.credentials_ready);
  const w = scannerWorkerState(s);
  const stateText = active ? 'פעיל' : ready ? 'מחובר · מושהה' : reasons[s.pause_reason ?? ''] ?? 'מנותק';
  // Green Play starts or reconnects the line; stopping discovery stays on the green square control.
  return <section dir="rtl" className="space-y-2 rounded-md bg-muted/40 p-2" aria-label="קו סריקת WhatsApp ייעודי">
    <div className="flex flex-nowrap items-center gap-1 overflow-x-auto text-sm">
      {!(active && ready) && <div className="flex shrink-0 items-center gap-0 [&>button]:h-8 [&>button]:w-8">
        {!ready && <span role="img" aria-label="קו הסריקה מנותק" title={`קו הסריקה מנותק · ${stateText}`} className="grid h-8 w-7 place-items-center text-destructive"><Unplug className="h-4 w-4" /></span>}
        <Button size="icon" variant="ghost" aria-label="הפעלת הסריקה" title={`הפעלת הסריקה · ${stateText}`} disabled={act.isPending} className="text-lead-whatsapp" onClick={() => setConfirm('resume')}>{act.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}</Button>
      </div>}
      <BrokerGenderSort />
      <div className="ms-auto flex shrink-0 items-center gap-1">
        <span className="inline-flex items-center gap-2 [&>button:first-child]:h-8 [&>button:first-child]:w-7"><BulkBrokerWhatsAppScan /><button type="button" className="shrink-0 tabular-nums text-xs text-muted-foreground hover:text-foreground" dir="ltr" aria-expanded={open} aria-label={`וואטסאפ שהושלמו מתוך התור, ${open ? 'כיווץ' : 'הרחבה'}`} title="וואטסאפ שהושלמו מתוך התור. לחיצה לפרטים" onClick={() => setOpen(o => !o)}>{status.data?.overview?.done ?? 0}/{status.data?.overview?.total ?? 0}</button></span>
        <span className="inline-flex items-center gap-0 [&>button]:h-8 [&>button]:w-7"><BulkBrokerRegistryRecheck onProgress={() => undefined} /><span role="status" className="tabular-nums text-xs text-muted-foreground" dir="ltr" title="ממתינים לאימות רישיון, מגן אדום">{redCount ?? '…'}</span></span>
        <span className="inline-flex items-center gap-0"><Button size="icon" variant="ghost" className="h-8 w-7" aria-label="פתיחת כרטיס הייבוא" title="ייבוא מתווכים ויזמים" onClick={openImport}><Download className="h-4 w-4" /></Button>{importProgress && <span role="status" dir="ltr" className="text-xs tabular-nums text-muted-foreground" title="מתווכים ויזמים שעובדו מתוך תהליך הייבוא">{importProgress.done}/{importProgress.total}</span>}</span>
        {onPrioritySort && <Button size="icon" variant="ghost" className={`h-8 w-7 ${prioritySort !== 'off' ? 'text-primary' : 'text-muted-foreground'}`} aria-label={prioritySort === 'progress' ? 'מיון: עם וואטסאפ קודם' : 'מיון: בתהליך קודם'} title={prioritySort === 'progress' ? 'בתהליך לפי זמן, נמצאו, ממתינים. לחיצה: נמצאו קודם' : prioritySort === 'found' ? 'נמצאו, בתהליך, ממתינים. לחיצה: בתהליך קודם' : 'בתהליך לפי זמן, נמצאו, ממתינים'} aria-pressed={prioritySort !== 'off'} onClick={onPrioritySort}><ArrowDownWideNarrow className="h-4 w-4" /></Button>}
      </div>
    </div>
    {open && (!status.data?.credentials_ready || w !== 'connected') && <p className="text-xs text-destructive">{[!status.data?.credentials_ready && 'חסרים פרטי קו', w !== 'connected' && workerStateLabels[w]].filter(Boolean).join(' · ')}</p>}
    {result && <p role="status" aria-live="polite" className={`text-xs ${result.ok ? 'text-lead-whatsapp' : 'text-destructive'}`}>{result.text}</p>}
    <ScannerActionConfirm open={confirm !== null} onOpenChange={value => { if (!value) setConfirm(null); }} title={confirm === 'pause' ? 'השהיית קו הסריקה' : confirm === 'configure' ? 'שמירת הגדרות הקו' : 'חיבור והפעלת קו הסריקה'} description={confirm === 'pause' ? 'להשהות את הקו? המשימות יישמרו וימשיכו לאחר הפעלה מחדש.' : confirm === 'configure' ? 'לשמור את ההגדרות? הקו יושהה עד הפעלה מחדש.' : `להפעיל את הקו עם מכסה של ${s.daily_cap} פניות ביום? הפניות הממתינות ימשיכו ברקע.`} confirmLabel={confirm === 'pause' ? 'השהיית הסריקה' : confirm === 'configure' ? 'שמירת ההגדרות' : 'הפעלת הסריקה'} pending={act.isPending} onConfirm={() => { if (confirm) act.mutate(confirm === 'configure' ? { action: confirm, daily_cap: value('daily_cap'), jitter_min_seconds: value('jitter_min_seconds'), jitter_max_seconds: value('jitter_max_seconds'), error_threshold: value('error_threshold'), max_outstanding: value('max_outstanding') } : { action: confirm }); }} />
    {open && <div className="space-y-2 border-t pt-2">
      {(() => { const delay = scannerDelayReason({ ...s, used_today: status.data?.used_today ?? 0, outstanding_until: status.data?.outstanding_until }); return (delay || s.pause_reason) ? <p role="status" className="text-sm text-muted-foreground">{delay}{s.pause_reason && <span className="block">{reasons[s.pause_reason] ?? scannerFailureReason(s.pause_reason) ?? 'הקו הושהה בעקבות תקלה; יש לבדוק את החיבור'}</span>}</p> : null; })()}
      {status.error && <p className="text-xs text-muted-foreground">רענון המצב נכשל זמנית. מוצג המצב האחרון שנקרא; התור לא השתנה.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span role="status">הושלמו {status.data?.overview?.done ?? 0} מתוך {status.data?.overview?.total ?? 0}</span><span>מספר הקו: <span dir="ltr" className="inline-block tabular-nums">{s.scanner_phone ? formatPhoneDisplay(s.scanner_phone) : 'לא זוהה'}</span></span></div>
      <div className="flex flex-wrap items-center gap-2">
        {field('daily_cap','מכסה יומית',1,150)}{field('max_outstanding','פניות במקביל',1,5)}{field('jitter_min_seconds','השהיה מ־',45,600)}{field('jitter_max_seconds','עד',45,600)}{field('error_threshold','עצירה אחרי שגיאות',1,5)}
        <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => setConfirm('configure')}>שמירה</Button>
      </div>
    </div>}
  </section>;
}
