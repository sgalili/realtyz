import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Loader2, Plug, Unplug } from 'lucide-react';
import { BulkBrokerWhatsAppScan } from './BulkBrokerWhatsAppScan';
import { BulkBrokerRegistryRecheck } from './BulkBrokerRegistryRecheck';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSuperAdminGate } from '@/hooks/useSuperAdminGate';
import { brokerWhatsAppRequest } from '@/lib/brokerWhatsAppRequest';
import { brokerUserError } from '../../../supabase/functions/_shared/brokerRecovery';
import { scannerWorkerState, workerStateLabels } from '@/lib/brokerScannerState';

export type ScannerSettings = { enabled: boolean; paused: boolean; pause_reason: string | null; daily_cap: number; jitter_min_seconds: number; jitter_max_seconds: number; start_hour: number; end_hour: number; error_threshold: number; next_send_at?: string | null; connected?: boolean; webhook_ready?: boolean; worker_seen_at?: string | null; worker_rejected_at?: string | null; config_checked_at?: string | null };
export type ScannerStatus = { settings: ScannerSettings; credentials_ready: boolean; used_today: number; manual_replies: number; queue_ahead?: number; outstanding?: boolean; outstanding_until?: string | null; job?: { id: string; status: string; last_error: string | null; reply_deadline?: string | null; next_source_at?: string | null; lease_until?: string | null; send_reserved_at?: string | null } | null; contact?: { whatsapp_phone: string } | null };
export async function scannerCall(body: Record<string, unknown>) {
  return brokerWhatsAppRequest<ScannerStatus & { ok?: boolean; reason?: string; error?: string }>('broker-whatsapp-scanner', body);
}
const reasons: Record<string, string> = { not_configured: 'טרם הוגדר', configuration_changed: 'ההגדרות השתנו — יש לבדוק ולהפעיל', user_paused: 'הושהה ידנית', scanner_disconnected: 'הקו מנותק', scanner_webhook_not_configured: 'הוובהוק אינו מוגדר בקו', scanner_phone_not_dedicated: 'הקו אינו ייעודי', scanner_instance_in_use_by_workspace: 'הקו כבר משמש חשבון אחר', scanner_credentials_missing: 'חסרים פרטי קו', scanner_phone_is_broker_contact: 'מספר הקו שמור כמספר של מתווך', save_settings_first: 'יש לשמור הגדרות תחילה', scanner_not_ready: 'הקו אינו מוכן' };

export function BrokerScannerPanel() {
  const qc = useQueryClient();
  const gate = useSuperAdminGate();
  const status = useQuery({ queryKey: ['broker-wa-scanner', gate.uid], enabled: gate.enabled, retry: false, queryFn: () => scannerCall({ action: 'status' }), refetchInterval: 15000 });
  const s = status.data?.settings;
  const [open, setOpen] = useState(false);
  const [registryResult, setRegistryResult] = useState('');
  const [draft, setDraft] = useState<Partial<ScannerSettings>>({});
  const value = (key: keyof ScannerSettings) => Number(draft[key] ?? s?.[key] ?? 0);
  // Last action result stays visible on the card, not only as a passing toast.
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const report = (ok: boolean, text: string) => { setResult({ ok, text }); (ok ? toast.success : toast.error)(text); };
  const act = useMutation({ mutationFn: (body: Record<string, unknown>) => scannerCall(body), onMutate: () => setResult(null), onSuccess: (data, body) => {
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
  const ready = !!(s.connected && s.webhook_ready && status.data.credentials_ready);
  const w = scannerWorkerState(s);
  const stateText = active ? 'פעיל' : ready ? 'מחובר · מושהה' : reasons[s.pause_reason ?? ''] ?? 'מנותק';
  // One control: active → pause; otherwise resume (which re-checks the connection before activating).
  const plugLabel = active ? 'מחובר וסורק · לחיצה להשהיה' : 'חיבור והפעלת הסריקה';
  return <section dir="rtl" className="space-y-2 rounded-md bg-muted/40 p-2" aria-label="קו סריקת WhatsApp ייעודי">
    <div className="flex items-center gap-2 text-sm">
      <Button variant="ghost" className="h-auto min-w-0 flex-1 gap-1 p-0 font-semibold" aria-expanded={open} onClick={() => setOpen(o => !o)}><span className="truncate">סריקת מספרי וואטסאפ</span><ChevronDown className={`h-4 w-4 shrink-0 ${open ? 'rotate-180' : ''}`} /></Button>
      <span className={`truncate text-xs ${active ? 'text-lead-whatsapp' : 'text-muted-foreground'}`}>{stateText}</span>
      <span className="tabular-nums text-xs text-muted-foreground" dir="ltr" title="פניות היום">{status.data.used_today}/{s.daily_cap}</span>
      <div className="ms-auto flex shrink-0 items-center [&>button]:h-8 [&>button]:w-8">
        <Button size="icon" variant="ghost" aria-label={plugLabel} title={plugLabel} disabled={act.isPending} className={active ? 'text-lead-whatsapp' : 'text-muted-foreground'} onClick={() => act.mutate({ action: active ? 'pause' : 'resume' })}>{act.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : active ? <Plug className="h-4 w-4" /> : <Unplug className="h-4 w-4" />}</Button>
        <BulkBrokerWhatsAppScan />
        <BulkBrokerRegistryRecheck onProgress={setRegistryResult} />
      </div>
    </div>
    {open && (!status.data.credentials_ready || w !== 'connected') && <p className="text-xs text-destructive">{[!status.data.credentials_ready && 'חסרים פרטי קו', w !== 'connected' && workerStateLabels[w]].filter(Boolean).join(' · ')}</p>}
    {result && <p role="status" aria-live="polite" className={`text-xs ${result.ok ? 'text-lead-whatsapp' : 'text-destructive'}`}>{result.text}</p>}
    {registryResult && <p role="status" aria-live="polite" className="text-xs text-muted-foreground">{registryResult}</p>}
    {open && <div className="space-y-2 border-t pt-2">
      <div className="flex flex-wrap items-center gap-2">
        {field('daily_cap','מכסה יומית',1,50)}{field('jitter_min_seconds','השהיה מ־',45,600)}{field('jitter_max_seconds','עד',45,600)}{field('error_threshold','עצירה אחרי שגיאות',1,5)}
        <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ action: 'configure', daily_cap: value('daily_cap'), jitter_min_seconds: value('jitter_min_seconds'), jitter_max_seconds: value('jitter_max_seconds'), error_threshold: value('error_threshold') })}>שמירה</Button>
      </div>
    </div>}
  </section>;
}
