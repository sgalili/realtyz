import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pause, Play, PlugZap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSuperAdminGate } from '@/hooks/useSuperAdminGate';
import { supabase } from '@/integrations/supabase/client';
import { scannerWorkerState, workerStateLabels } from '@/lib/brokerScannerState';

export type ScannerSettings = { enabled: boolean; paused: boolean; pause_reason: string | null; daily_cap: number; jitter_min_seconds: number; jitter_max_seconds: number; start_hour: number; end_hour: number; error_threshold: number; next_send_at?: string | null; connected?: boolean; webhook_ready?: boolean; worker_seen_at?: string | null; worker_rejected_at?: string | null; config_checked_at?: string | null };
export type ScannerStatus = { settings: ScannerSettings; credentials_ready: boolean; used_today: number; manual_replies: number; queue_ahead?: number; outstanding?: boolean; job?: { id: string; status: string; last_error: string | null } | null; contact?: { whatsapp_phone: string } | null };
export async function scannerCall(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('broker-whatsapp-scanner', { body });
  if (data?.error) throw new Error(data.error === 'scanner_operation_failed' ? 'הבדיקה מול Green API נכשלה; נסו שוב בעוד דקה' : data.error);
  if (error) {
    // Non-2xx responses arrive only in error.context; read the server's message instead of a generic failure.
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(body?.error === 'forbidden' ? 'אין הרשאת Super Admin' : body?.error === 'scanner_operation_failed' ? 'הבדיקה מול Green API נכשלה; נסו שוב בעוד דקה' : body?.error || 'פעולת קו הסריקה נכשלה');
  }
  return data as ScannerStatus & { ok?: boolean; reason?: string; error?: string };
}
const reasons: Record<string, string> = { not_configured: 'טרם הוגדר', configuration_changed: 'ההגדרות השתנו — יש לבדוק ולהפעיל', user_paused: 'הושהה ידנית', scanner_disconnected: 'הקו מנותק', scanner_webhook_not_configured: 'הוובהוק אינו מוגדר בקו', scanner_phone_not_dedicated: 'הקו אינו ייעודי', scanner_instance_in_use_by_workspace: 'הקו כבר משמש חשבון אחר', scanner_credentials_missing: 'חסרים פרטי קו', scanner_phone_is_broker_contact: 'מספר הקו שמור כמספר של מתווך', save_settings_first: 'יש לשמור הגדרות תחילה', scanner_not_ready: 'הקו אינו מוכן' };

export function BrokerScannerPanel() {
  const qc = useQueryClient();
  const gate = useSuperAdminGate();
  const status = useQuery({ queryKey: ['broker-wa-scanner', gate.uid], enabled: gate.enabled, retry: false, queryFn: () => scannerCall({ action: 'status' }), refetchInterval: 15000 });
  const s = status.data?.settings;
  const [draft, setDraft] = useState<Partial<ScannerSettings>>({});
  const value = (key: keyof ScannerSettings) => Number(draft[key] ?? s?.[key] ?? 0);
  // Last action result stays visible on the card, not only as a passing toast.
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const report = (ok: boolean, text: string) => { setResult({ ok, text }); (ok ? toast.success : toast.error)(text); };
  const act = useMutation({ mutationFn: (body: Record<string, unknown>) => scannerCall(body), onMutate: () => setResult(null), onSuccess: (data, body) => {
    if (data.ok === false) report(false, `${reasons[data.reason ?? ''] ?? data.error ?? 'הקו אינו מוכן'}${body.action === 'resume' || body.action === 'test_connection' ? '; הסריקה לא הופעלה' : ''}`);
    else if (body.action === 'configure') { setDraft({}); report(true, 'נשמר. הקו מושהה עד בדיקה והפעלה'); }
    else if (body.action === 'test_connection') report(true, s?.enabled && !s.paused ? 'החיבור תקין והקו פעיל' : 'החיבור תקין. הקו עדיין מושהה — לחצו על ▶ כדי להפעיל');
    else report(true, body.action === 'pause' ? 'הסריקה הושהתה' : 'הסריקה פעילה');
    void qc.invalidateQueries({ queryKey: ['broker-wa-scanner'] });
    void qc.invalidateQueries({ queryKey: ['broker-wa-scanner-job'] });
  }, onError: (e: Error) => report(false, e.message) });
  if (status.isLoading) return <Loader2 className="h-4 w-4 animate-spin" aria-label="טוען קו סריקה" />;
  if (status.isError || !s) return <p className="text-sm text-destructive">לא ניתן לקרוא את מצב קו הסריקה</p>;
  const field = (key: keyof ScannerSettings, label: string, min: number, max: number) => <label className="flex items-center gap-1 text-sm">{label}<Input type="number" min={min} max={max} className="h-8 w-16" value={value(key)} onChange={e => setDraft(d => ({ ...d, [key]: Number(e.target.value) }))} /></label>;
  const active = s.enabled && !s.paused;
  return <section dir="rtl" className="space-y-2 rounded-md bg-muted/40 p-3" aria-label="קו סריקת WhatsApp ייעודי">
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <strong>קו סריקה ייעודי</strong>
      <span className={active ? 'text-lead-whatsapp' : 'text-muted-foreground'}>{active ? 'פעיל' : s.paused && s.connected && s.webhook_ready ? 'מחובר · לחץ הפעלה' : `מושהה · ${reasons[s.pause_reason ?? ''] ?? s.pause_reason ?? ''}`}</span>
      <span>{status.data.used_today}/{s.daily_cap} פניות היום</span>
      {status.data.manual_replies > 0 && <span className="text-destructive">{status.data.manual_replies} תשובות לבדיקה ידנית</span>}
      {!status.data.credentials_ready && <span className="text-destructive">חסרים פרטי קו</span>}
      {(() => { const w = scannerWorkerState(s); return <span className={w === 'connected' ? 'text-lead-whatsapp' : 'text-destructive'}>{workerStateLabels[w]}</span>; })()}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {field('daily_cap','מכסה יומית',1,50)}{field('jitter_min_seconds','השהיה מ־',45,600)}{field('jitter_max_seconds','עד',45,600)}{field('error_threshold','עצירה אחרי שגיאות',1,5)}
      <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ action: 'configure', daily_cap: value('daily_cap'), jitter_min_seconds: value('jitter_min_seconds'), jitter_max_seconds: value('jitter_max_seconds'), error_threshold: value('error_threshold') })}>שמירה</Button>
      <Button size="icon" variant="ghost" aria-label="בדיקת חיבור הקו" disabled={act.isPending} onClick={() => act.mutate({ action: 'test_connection' })}><PlugZap className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" aria-label={active ? 'השהיית הסריקה' : 'הפעלת הסריקה'} disabled={act.isPending} onClick={() => act.mutate({ action: active ? 'pause' : 'resume' })}>{act.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button>
    </div>
    {act.isPending && <p role="status" className="text-sm text-muted-foreground">בודק…</p>}
    {result && <p role="status" aria-live="polite" className={`text-sm ${result.ok ? 'text-lead-whatsapp' : 'text-destructive'}`}>{result.text}</p>}
    <p className="text-xs text-muted-foreground">ההגבלות מפחיתות סיכון אך אינן מבטיחות שהקו לא ייחסם. נשלח רק נוסח הפנייה שמופיע במודעה. הקו פועל 24/7 לפי המכסה היומית וההשהיה האקראית.</p>
  </section>;
}