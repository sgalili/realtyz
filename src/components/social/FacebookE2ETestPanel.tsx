import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { getCloudSessionState } from '@/lib/cloudSession';
import { ensureMandatoryComment } from '@/lib/mandatoryComment';
import { loadFbTestMode, saveFbTestMode, subscribeFbTestMode, type FbTestModeState } from '@/lib/fbTestMode';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, XCircle, Loader2, Circle, FlaskConical, RotateCcw, Play } from 'lucide-react';

type StepKey = 'session' | 'fetch' | 'queue';
type StepState = { status: 'idle' | 'running' | 'ok' | 'fail'; detail?: string };
type LogLine = { at: string; step: StepKey; text: string; error?: boolean };

const STEP_LABEL: Record<StepKey, string> = {
  session: 'חיבור דפדפן הענן והסשן',
  fetch: 'שליפת נתונים בזמן אמת',
  queue: 'הכנת וריאציה וביצוע בתור',
};
const FINAL = new Set(['completed', 'published', 'failed', 'error', 'cancelled', 'skipped']);

/**
 * Single account / single group end-to-end test. Uses the workspace's own
 * cloud session (one account) and exactly one confirmed group. Writes one
 * queue row only after an explicit click; bulk runs are clamped while on.
 */
export function FacebookE2ETestPanel() {
  const ws = useActiveWorkspaceOwnerId();
  const [mode, setMode] = useState<FbTestModeState>(() => loadFbTestMode(ws));
  const [steps, setSteps] = useState<Record<StepKey, StepState>>({ session: { status: 'idle' }, fetch: { status: 'idle' }, queue: { status: 'idle' } });
  const [log, setLog] = useState<LogLine[]>([]);
  const [body, setBody] = useState('');
  const [running, setRunning] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => { setMode(loadFbTestMode(ws)); return subscribeFbTestMode(() => setMode(loadFbTestMode(ws))); }, [ws]);
  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  const { data: groups = [] } = useQuery({
    queryKey: ['fb-test-groups', ws],
    enabled: !!ws && mode.enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('custom_user_groups')
        .select('id, group_name, group_url').eq('workspace_owner_id', ws).order('group_name');
      if (error) throw error;
      return (data ?? []) as { id: string; group_name: string | null; group_url: string | null }[];
    },
  });

  const update = (s: FbTestModeState) => { saveFbTestMode(ws, s); setMode(s); };
  const add = (step: StepKey, text: string, error = false) =>
    setLog((l) => [...l, { at: new Date().toLocaleTimeString('he-IL'), step, text, error }]);
  const set = (step: StepKey, s: StepState) => setSteps((p) => ({ ...p, [step]: s }));
  const fail = (step: StepKey, text: string) => { set(step, { status: 'fail', detail: text }); add(step, text, true); };

  const run = async () => {
    if (!ws || !mode.target) return;
    if (!body.trim()) { add('queue', 'יש לכתוב תוכן לבדיקה', true); return; }
    setRunning(true); setLog([]);
    setSteps({ session: { status: 'running' }, fetch: { status: 'idle' }, queue: { status: 'idle' } });
    try {
      // (a) session
      add('session', 'בודק סשן ענן ומצב דפדפן');
      const s = await getCloudSessionState();
      if (!s.workerReady) return fail('session', 'דפדפן הענן אינו מוגדר בשרת');
      if (!s.active) return fail('session', `אין סשן פעיל${s.status ? ` (מצב: ${s.status})` : ''}${s.lastError ? `: ${s.lastError}` : ''}`);
      set('session', { status: 'ok', detail: s.expiresAt ? `בתוקף עד ${new Date(s.expiresAt).toLocaleString('he-IL')}` : 'פעיל' });
      add('session', 'הסשן פעיל ודפדפן הענן מוכן');

      // (b) fetch
      set('fetch', { status: 'running' });
      add('fetch', 'שולף את קבוצת הבדיקה מהשרת');
      const t0 = performance.now();
      const { data: g, error: ge } = await (supabase as any).from('custom_user_groups')
        .select('id, group_name, group_url').eq('workspace_owner_id', ws).eq('id', mode.target.id).maybeSingle();
      if (ge) return fail('fetch', `שגיאת שליפה: ${ge.message}`);
      if (!g) return fail('fetch', 'הקבוצה לא נמצאה במרחב העבודה הפעיל');
      set('fetch', { status: 'ok', detail: `${g.group_name ?? ''} · ${Math.round(performance.now() - t0)} מ״ש` });
      add('fetch', `נשלפה הקבוצה ${g.group_name ?? ''}`);

      // (c) variation + queue
      set('queue', { status: 'running' });
      add('queue', 'מכין וריאציה אחת');
      let text = body.trim();
      const { data: v, error: ve } = await (supabase as any).functions.invoke('spin-group-post', {
        body: { body: text, group_name: g.group_name, group_url: g.group_url, seed: 1 },
      });
      if (ve) add('queue', `וריאציה נכשלה, נשלח הנוסח המקורי: ${ve.message}`, true);
      else if (String(v?.draft ?? '').trim()) text = String(v.draft).trim();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user?.id) return fail('queue', 'נדרשת התחברות מחדש');
      const { data: row, error: qe } = await (supabase as any).from('campaign_activity_queue').insert({
        workspace_owner_id: ws, created_by: auth.user.id, activity_type: 'fb_group_post',
        target_ref: g.id, target_label: g.group_name, scheduled_for: new Date().toISOString(),
        status: 'pending', publication_status: 'pending_time_bank', variation_index: 0,
        variations: [{ body: text }],
        payload: { body: text, link: null, image_url: null, first_comment: ensureMandatoryComment(null), group_url: g.group_url, ai_variation: true, e2e_test: true },
      }).select('id').single();
      if (qe) return fail('queue', `הכנסה לתור נכשלה: ${qe.message}`);
      update({ ...mode, queueRowId: row.id });
      add('queue', 'נוסף לתור, ממתין לביצוע');
      const started = Date.now();
      let last = '';
      pollRef.current = window.setInterval(async () => {
        const { data: r } = await (supabase as any).from('campaign_activity_queue')
          .select('status, publication_status, last_error, runner_note, attempts').eq('id', row.id).maybeSingle();
        if (!r) return;
        const sig = `${r.status}/${r.publication_status}`;
        if (sig !== last) { last = sig; add('queue', `מצב: ${r.status} · ${r.publication_status}${r.runner_note ? ` · ${r.runner_note}` : ''}`); }
        const done = FINAL.has(r.status) || FINAL.has(r.publication_status);
        if (r.last_error) { window.clearInterval(pollRef.current!); setRunning(false); fail('queue', `שגיאת ביצוע: ${r.last_error}`); }
        else if (done) { window.clearInterval(pollRef.current!); setRunning(false); set('queue', { status: 'ok', detail: sig }); add('queue', 'הבדיקה הסתיימה'); }
        else if (Date.now() - started > 5 * 60_000) { window.clearInterval(pollRef.current!); setRunning(false); fail('queue', `לא בוצע תוך 5 דקות (מצב אחרון ${sig}, ניסיונות ${r.attempts})`); }
      }, 4000);
      return;
    } catch (e: any) {
      fail('queue', e?.message ?? 'שגיאה לא צפויה');
    } finally {
      if (!pollRef.current) setRunning(false);
    }
  };

  const reset = async () => {
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    if (mode.queueRowId) {
      // Only an unclaimed pending test row is removed; executed rows stay as history.
      await (supabase as any).from('campaign_activity_queue').delete()
        .eq('id', mode.queueRowId).eq('status', 'pending').is('claimed_by', null);
    }
    update({ enabled: false, target: null, queueRowId: null });
    setLog([]); setRunning(false);
    setSteps({ session: { status: 'idle' }, fetch: { status: 'idle' }, queue: { status: 'idle' } });
  };

  const Icon = ({ s }: { s: StepState['status'] }) =>
    s === 'ok' ? <CheckCircle2 className="h-4 w-4 text-success" /> : s === 'fail' ? <XCircle className="h-4 w-4 text-destructive" />
      : s === 'running' ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Circle className="h-4 w-4 text-muted-foreground" />;

  return (
    <Card dir="rtl" className="text-right">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base"><FlaskConical className="h-4 w-4" />מצב בדיקה לחשבון וקבוצה אחת</CardTitle>
          <Switch checked={mode.enabled} disabled={running} aria-label="מצב בדיקה"
            onCheckedChange={(on) => (on ? update({ ...mode, enabled: true }) : void reset())} />
        </div>
        <CardDescription>בודק חיבור, שליפה ופרסום על יעד יחיד. בזמן הבדיקה פרסום לכמה קבוצות נעול.</CardDescription>
      </CardHeader>
      {mode.enabled && (
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">חשבון הבדיקה: חשבון פייסבוק המחובר בענן במרחב העבודה הזה.</p>
          <Select value={mode.target?.id ?? ''} disabled={running}
            onValueChange={(id) => { const g = groups.find((x) => x.id === id); if (g) update({ ...mode, target: { id: g.id, name: g.group_name ?? '', url: g.group_url } }); }}>
            <SelectTrigger><SelectValue placeholder="בחירת קבוצת בדיקה אחת" /></SelectTrigger>
            <SelectContent>{groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.group_name ?? g.id}</SelectItem>)}</SelectContent>
          </Select>
          {mode.target && <Badge variant="secondary">יעד נעול: {mode.target.name}</Badge>}
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="תוכן פוסט הבדיקה" rows={3} disabled={running} />
          <ul className="space-y-1.5">
            {(Object.keys(STEP_LABEL) as StepKey[]).map((k) => (
              <li key={k} className="flex items-start gap-2 text-sm">
                <Icon s={steps[k].status} />
                <span className="font-medium">{STEP_LABEL[k]}</span>
                {steps[k].detail && <span className={steps[k].status === 'fail' ? 'text-destructive' : 'text-muted-foreground'}>· {steps[k].detail}</span>}
              </li>
            ))}
          </ul>
          {log.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-md bg-muted p-2 font-mono text-xs">
              {log.map((l, i) => <div key={i} className={l.error ? 'text-destructive' : ''}>{l.at} · {STEP_LABEL[l.step]} · {l.text}</div>)}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <Button onClick={run} disabled={running || !mode.target || !body.trim()}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}הרצת בדיקה
            </Button>
            <Button variant="ghost" onClick={reset}><RotateCcw className="h-4 w-4" />איפוס ויציאה</Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
