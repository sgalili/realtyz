import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { developerImportPageKind, developerImportUrl } from '@/lib/developerImportUrl';
import { startContinuousImportRunner } from '@/lib/continuousImportRunner';
import { refreshImportedInventory } from '@/lib/refreshImportedInventory';
import { readAllRows } from '../../../supabase/functions/_shared/readAllRows';

const YAD2_RE = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)*yad2\.co\.il\/[^\s<>]+/i;

/** Starts a durable import; every developer/project page runs in its own background chunk. */
export function DeveloperYad2Import({ onSaved, initialUrl, developerId }: { onSaved?: (summary: { projects: number; units: number }) => void; initialUrl?: string | null; developerId?: string | null }) {
  const { activeWorkspaceId } = useWorkspace();
  const qc = useQueryClient();
  const [url, setUrl] = useState(initialUrl ?? '');
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const reported = useRef<string | null>(null);
  const workspaceRef = useRef(activeWorkspaceId);
  workspaceRef.current = activeWorkspaceId;

  useEffect(() => { setUrl(initialUrl ?? ''); setJobId(null); setError(''); setStarting(false); reported.current = null; }, [activeWorkspaceId, developerId, initialUrl]);

  const { data: recovered } = useQuery({
    queryKey: ['developer-import-active', activeWorkspaceId, developerId, initialUrl],
    enabled: !!activeWorkspaceId && !jobId,
    // A running job may only be recovered for the exact developer shown on this page.
    queryFn: async () => {
      if (!activeWorkspaceId) return null;
      let query = supabase.from('developer_import_jobs').select('id').eq('workspace_owner_id', activeWorkspaceId).eq('status', 'running').order('created_at', { ascending: false }).limit(1);
      if (developerId) query = query.eq('developer_id', developerId);
      const { data, error: queryError } = await query.maybeSingle();
      if (queryError) throw queryError;
      return data;
    },
  });
  useEffect(() => { if (recovered?.id && !jobId) setJobId(recovered.id); }, [recovered, jobId]);

  const { data: job } = useQuery({
    queryKey: ['developer-import-job', activeWorkspaceId, jobId],
    enabled: !!activeWorkspaceId && !!jobId,
    refetchInterval: query => query.state.data?.status === 'running' ? 2000 : false,
    queryFn: async () => {
      if (!activeWorkspaceId || !jobId) return null;
      const { data, error: queryError } = await supabase.from('developer_import_jobs').select('id,status,stage,error,source_url,developer_id,updated_at').eq('workspace_owner_id', activeWorkspaceId).eq('id', jobId).single();
      if (queryError) throw queryError;
      return data;
    },
  });

  const inventory = useQuery({
    queryKey: ['developer-import-inventory', activeWorkspaceId, job?.developer_id, job?.updated_at],
    enabled: !!activeWorkspaceId && !!job?.developer_id,
    queryFn: async () => {
      const developerId = job?.developer_id;
      if (!activeWorkspaceId || !developerId) throw new Error('inventory_unavailable');
      const rows = await readAllRows((from, to) => supabase.from('developer_projects').select('id,apartments').eq('developer_id', developerId).eq('workspace_owner_id', activeWorkspaceId).order('id').range(from, to));
      return { projects: rows.length, units: rows.reduce((sum, row) => sum + (Array.isArray(row.apartments) ? row.apartments.length : 0), 0) };
    },
  });
  useEffect(() => {
    if (job?.updated_at) void refreshImportedInventory(qc);
  }, [job?.updated_at, qc]);
  const { data: pages = [] } = useQuery({
    queryKey: ['developer-import-pages', activeWorkspaceId, jobId],
    enabled: !!activeWorkspaceId && !!jobId,
    refetchInterval: job?.status === 'running' ? 2000 : false,
    queryFn: async () => {
      if (!jobId) return [];
      const currentJobId = jobId;
      return readAllRows((from, to) => supabase.from('developer_import_pages').select('id,kind,status,attempts,error,next_attempt_at').eq('job_id', currentJobId).order('created_at').order('id').range(from, to));
    },
  });

  useEffect(() => {
    if (!activeWorkspaceId || !jobId || job?.status !== 'running') return;
    const workspace = activeWorkspaceId;
    return startContinuousImportRunner({
      step: async () => {
        const { data, error: invokeError } = await supabase.functions.invoke('developer-import-jobs', { body: { action: 'continue', job_id: jobId, workspace_owner_id: workspace } });
        if (invokeError || data?.error) throw invokeError ?? new Error(data.error);
        return data ?? {};
      },
      refresh: () => Promise.all([
        qc.invalidateQueries({ queryKey: ['developer-import-job', workspace, jobId] }),
        qc.invalidateQueries({ queryKey: ['developer-import-pages', workspace, jobId] }),
      ]),
    });
  }, [activeWorkspaceId, jobId, job?.status, qc]);

  const projectPages = pages.filter(page => page.kind === 'project');
  const completed = projectPages.filter(page => page.status === 'completed').length;
  const failed = projectPages.filter(page => page.status === 'failed').length;
  const pending = pages.filter(page => page.status === 'pending' || page.status === 'running').length;
  const progress = job?.status === 'completed' ? 100 : job?.stage === 'profile' ? 5 : projectPages.length ? Math.min(99, Math.round((completed + failed) / projectPages.length * 100)) : 10;
  const waiting = pages.find(page => page.status === 'pending' && page.next_attempt_at && new Date(page.next_attempt_at).getTime() > Date.now());

  useEffect(() => {
    if (!job || job.status !== 'completed' || !inventory.data || reported.current === job.id) return;
    reported.current = job.id;
    toast.success(failed ? `הייבוא הסתיים: ${inventory.data.projects} פרויקטים שמורים, ${failed} עמודים נכשלו` : `שמורים ${inventory.data.projects} פרויקטים ו־${inventory.data.units} דירות`);
    onSaved?.(inventory.data);
  }, [job, inventory.data, failed, onSaved]);

  const start = async (value: string) => {
    if (starting || !activeWorkspaceId) return;
    const clean = developerImportUrl(value);
    if (!clean) { setError('הדביקו קישור תקין לעמוד היזם או לפרויקט מסוים ביד2'); return; }
    const originWorkspace = activeWorkspaceId;
    setStarting(true); setError(''); setUrl(clean); reported.current = null;
    const { data, error: invokeError } = await supabase.functions.invoke('developer-import-jobs', { body: { action: 'start', url: clean, workspace_owner_id: originWorkspace, ...(developerId ? { developer_id: developerId } : {}) } });
    if (workspaceRef.current !== originWorkspace) return;
    setStarting(false);
    if (invokeError || !data?.job_id) {
      let message = data?.message ?? 'פתיחת הייבוא נכשלה. נסו שוב.';
      try { const body = await (invokeError as { context?: { json?: () => Promise<{ message?: string }> } })?.context?.json?.(); if (body?.message) message = body.message; } catch { /* retain safe message */ }
      setError(message); return;
    }
    setJobId(data.job_id);
  };

  const directProject = developerImportPageKind(url) === 'project';
  const scopedDeveloper = developerId ? ' הייבוא ישויך רק ליזם הנוכחי וישלים פרויקטים ודירות חסרים ללא כפילויות.' : '';

  return <div className="space-y-4">
    <div className="space-y-2">
      <Label htmlFor="dev-yad2-url" className="text-base font-bold">קישור לעמוד יזם או לפרויקט ביד2</Label>
      <p id="dev-yad2-help" className="text-base text-muted-foreground">אפשר להדביק עמוד חברה לייבוא כל הפרויקטים, או קישור ישיר לפרויקט אחד. החברה, הפרויקטים, הדירות וציר הזמן נשמרים ברקע.{scopedDeveloper}</p>
    </div>
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input id="dev-yad2-url" aria-describedby="dev-yad2-help" dir="ltr" type="url" placeholder="https://www.yad2.co.il/yad1/developers/... או /yad1/project/..." value={url} disabled={starting || job?.status === 'running'}
        onChange={event => setUrl(event.target.value)}
        onPaste={event => { const text = event.clipboardData.getData('text').trim(); if (YAD2_RE.test(text)) { event.preventDefault(); setUrl(text.match(YAD2_RE)?.[0] ?? text); setError(''); } }} />
      <Button type="button" onClick={() => void start(url)} disabled={starting || job?.status === 'running' || !url.trim()}>{starting && <Loader2 className="h-4 w-4 animate-spin" />}{directProject ? 'ייבוא הפרויקט' : 'ייבוא כל הפרויקטים'}</Button>
    </div>
    {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-base text-destructive">{error}</div>}
    {job && <div role="status" aria-live="polite" className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <strong className="text-base">{job.status === 'completed' ? 'הייבוא הושלם' : job.status === 'failed' ? 'הייבוא נכשל' : job.stage === 'profile' ? 'קורא את עמוד החברה' : 'מייבא כל פרויקט בנפרד'}</strong>
        {job.status === 'running' ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" /> : job.status === 'completed' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />}
      </div>
      <Progress value={progress} className="h-2" />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {inventory.data && <span>{inventory.data.projects} פרויקטים · {inventory.data.units} דירות שמורות</span>}
        {inventory.isError && <span className="text-destructive">לא ניתן לקרוא את ספירת המלאי</span>}
        {projectPages.length > 0 && <span>{completed + failed} מתוך {projectPages.length} עמודים</span>}
        {job.status === 'running' && <span>{pending} עמודים נותרו</span>}
        {failed > 0 && <span className="text-destructive">{failed} נכשלו</span>}
      </div>
      {waiting && job.status === 'running' && <p className="text-sm text-muted-foreground">ניסיון חוזר אוטומטי מתוזמן. כל ההתקדמות נשמרה.</p>}
      {job.error && <p className={`text-sm ${job.status === 'failed' || failed ? 'text-destructive' : 'text-muted-foreground'}`}>{job.error}</p>}
      {job.status === 'failed' && <Button type="button" variant="outline" size="sm" onClick={() => { setJobId(null); void start(job.source_url); }}>פתיחת ייבוא חדש</Button>}
    </div>}
  </div>;
}

export default DeveloperYad2Import;
