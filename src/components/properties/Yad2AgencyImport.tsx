import { CollapsibleCard } from '@/components/ui/collapsible-card';
import { useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Loader2, Download, CheckCircle2, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { importCommissionPayload, importBatchDealTypes, canApplyImportRule, readImportRule, saveImportRule, runPool, type ImportCommissionRule, type ImportDealType } from '@/lib/importCommissionDefaults';
import { agencyUrlForRequest, isYad2AgencyUrl } from '@/lib/yad2ImportLinks';
import { ImportCommissionDialog } from './ImportCommissionDialog';


const BROKER_ROLES = ['managing_broker', 'agent', 'lead_agent', 'junior_agent', 'super_admin'];
const PARALLEL = 4;

type ImportProgress = { total: number; done: number; failed: number; running: number };

async function errorText(error: unknown) {
  if (error instanceof FunctionsHttpError) { try { const b = await error.context.json(); return b?.message || b?.detail || b?.error || 'שגיאה'; } catch { /* ignore */ } }
  return error instanceof Error ? error.message : 'שגיאה';
}

/** Applies a commission rule to one workspace listing, merging the closing fee into its features. */
async function applyRule(listingId: string, workspaceId: string, rule: ImportCommissionRule, acceptedAt: string) {
  const { data: row, error: readError } = await supabase.from('listings').select('id, deal_type, asking_price, features').eq('id', listingId).eq('workspace_owner_id', workspaceId).maybeSingle();
  if (readError) throw readError;
  if (!row) throw new Error('לא ניתן לעדכן נכס שאינו משויך למשרד הנבחר');
  const feature = Array.isArray(row.features) ? (row.features[0] ?? {}) : (row.features ?? {});
  const dealType = (feature as { listing_type?: string }).listing_type ?? row.deal_type;
  const { closing, ...columns } = importCommissionPayload(dealType, Number(row.asking_price) || 0, rule);
  const { data: saved, error } = await supabase.from('listings').update({ ...columns, features: { ...(feature as object), deal_closing_commission: closing, commission_terms_accepted_at: acceptedAt } } as never).eq('id', listingId).eq('workspace_owner_id', workspaceId).select('id').maybeSingle();
  if (error) throw error;
  if (!saved) throw new Error('שמירת העמלות לא הושלמה');
}


import { savePendingYad2Import, readPendingYad2Import, clearPendingYad2Import } from '@/lib/pendingYad2Import';

export default function Yad2AgencyImport({ publisherType = 'broker', open = true, onToggle }: { publisherType?: string; open?: boolean; onToggle?: () => void }) {

  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [url, setUrl] = useState(() => { const p = readPendingYad2Import(); return p?.kind === 'agency' ? p.url : ''; });
  const autoStarted = useRef(false);
  const [phase, setPhase] = useState<'idle' | 'discovering' | 'importing' | 'done'>('idle');
  const [progress, setProgress] = useState<ImportProgress>({ total: 0, done: 0, failed: 0, running: 0 });
  const [imported, setImported] = useState<string[]>([]);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [dealTypes, setDealTypes] = useState<ImportDealType[]>([]);
  const [saving, setSaving] = useState(false);
  const [rule, setRule] = useState<ImportCommissionRule>(() => (user && activeWorkspaceId ? readImportRule(user.id, activeWorkspaceId) : readImportRule('', '')));
  const scope = useRef(0);

  useEffect(() => {
    scope.current++; setPhase('idle'); setImported([]); setRuleOpen(false); setDealTypes([]); setSaving(false); setProgress({ total: 0, done: 0, failed: 0, running: 0 });
    if (user && activeWorkspaceId) setRule(readImportRule(user.id, activeWorkspaceId));
  }, [user?.id, activeWorkspaceId]);

  const { data: roles = [] } = useQuery({
    queryKey: ['verified-roles-import', user?.id], enabled: !!user?.id,
    queryFn: async () => { const { data } = await supabase.rpc('get_verified_user_roles'); return (data ?? []) as string[]; },
  });
  // Resume an import a guest started before signing in.
  useEffect(() => {
    if (autoStarted.current || !user || !activeWorkspaceId || phase !== 'idle') return;
    const p = readPendingYad2Import();
    if (p?.kind !== 'agency' || !p.url) return;
    autoStarted.current = true; setUrl(p.url);
    void start(p.url);
  });

  if (user && !activeWorkspaceId) return null;
  const unverifiedBroker = publisherType === 'broker' && !roles.some(r => BROKER_ROLES.includes(r));

  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['my-ad-recovery'] }); void queryClient.invalidateQueries({ queryKey: ['my-ads-stats'] }); };

  const start = async (value: string = url) => {
    if (!user || !activeWorkspaceId) { savePendingYad2Import({ kind: 'agency', url: value.trim(), publisherType }); navigate('/auth', { state: { returnTo: window.location.pathname } }); return; }
    clearPendingYad2Import();
    const run = ++scope.current, ws = activeWorkspaceId;
    const completed: string[] = [];
    const types: string[] = [];
    setPhase('discovering'); setImported([]); setDealTypes([]);
    const { data, error } = await supabase.functions.invoke('yad2-agency-import', { body: { url: agencyUrlForRequest(value) } });
    if (run !== scope.current) return;
    if (error || !data?.ok) { toast.error(await errorText(error) || 'לא נמצאו מודעות'); setPhase('idle'); return; }
    const items: string[] = data.items ?? [];
    if (!items.length) { toast.error('לא נמצאו מודעות בעמוד המשרד'); setPhase('idle'); return; }
    setProgress({ total: items.length, done: 0, failed: 0, running: 0 });
    setPhase('importing');
    await runPool(items, PARALLEL, async (item) => {
      if (run !== scope.current) return;
      setProgress(p => ({ ...p, running: p.running + 1 }));
      let id: string | null = null;
      try {
        const { data: res, error: e } = await supabase.functions.invoke('yad2-unlocker', { body: { url: item, limit: 1, pages: 1, import_item: true } });
        if (!e && typeof res?.listing_id === 'string') {
          const { data: row, error: readError } = await supabase.from('listings').select('id, deal_type, features').eq('id', res.listing_id).eq('workspace_owner_id', ws).maybeSingle();
          if (readError || !row) throw readError ?? new Error('הנכס לא נשמר במשרד הנבחר');
          id = row.id;
          const feature = Array.isArray(row.features) ? row.features[0] : row.features;
          types.push((feature as { listing_type?: string } | null)?.listing_type ?? row.deal_type ?? 'sale');
        }
      } catch { id = null; }
      if (run !== scope.current) return;
      setProgress(p => ({ ...p, running: p.running - 1, done: p.done + (id ? 1 : 0), failed: p.failed + (id ? 0 : 1) }));
      if (id) { const savedId = id; completed.push(savedId); setImported(list => [...list, savedId]); refresh(); }
    });
    if (run !== scope.current) return;
    setPhase('done'); setDealTypes(importBatchDealTypes(types)); setRuleOpen(completed.length > 0);
  };

  const applyGlobal = async (accepted: boolean) => {
    if (!user || !activeWorkspaceId || saving || !canApplyImportRule(rule, dealTypes, accepted)) return;
    const run = scope.current, ws = activeWorkspaceId, accountId = user.id;
    const acceptedAt = new Date().toISOString();
    setSaving(true);
    let failed = 0;
    await runPool(imported, PARALLEL, async id => {
      if (run !== scope.current) return;
      try { await applyRule(id, ws, rule, acceptedAt); }
      catch (error) { failed++; console.error('[yad2-import-commissions]', { listingId: id, message: error instanceof Error ? error.message : 'save_failed' }); }
    });
    if (run !== scope.current) return;
    setSaving(false); refresh();
    if (failed) { toast.error(`שמירת העמלות נכשלה ב-${failed} נכסים. אפשר לנסות שוב.`); return; }
    saveImportRule(accountId, ws, rule); setRuleOpen(false);
    toast.success(`העמלות עודכנו ב-${imported.length} נכסים`);
  };

  const busy = phase === 'discovering' || phase === 'importing';
  const pending = progress.total - progress.done - progress.failed;

  return <CollapsibleCard title="יבוא כל המודעות שלי מיד 2" open={open || busy || phase === 'done'} onToggle={() => onToggle?.()}>
    <p className="text-[15.5px] leading-6 text-muted-foreground">יש לכם עמוד משרד ביד שתיים? הדביקו את הקישור הראשי שלו וכל המודעות שפרסמתם יובאו בלחיצה אחת.</p>
    <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.yad2.co.il/realestate/agency/..." dir="ltr" disabled={busy} className="text-[16px] placeholder:text-muted-foreground/35" />
    <p className="text-[12.5px] leading-5 text-muted-foreground">{publisherType === 'developer' ? 'טיפ: ביד 2, היכנסו לאחד הפרויקטים שלכם ולחצו על שם החברה כדי להגיע לעמוד הראשי.' : 'טיפ: ביד 2, היכנסו לאחת המודעות שלכם ולחצו על שם המשרד כדי להגיע לעמוד הראשי'}</p>
    {isYad2AgencyUrl(url) && <Button onClick={() => void start()} disabled={busy} className="w-full gap-2">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{phase === 'discovering' ? 'מאתר מודעות…' : 'יבוא כל הנכסים'}
    </Button>}

    {phase !== 'idle' && phase !== 'discovering' && <div className="space-y-2" aria-live="polite">
      <Progress value={progress.total ? ((progress.done + progress.failed) / progress.total) * 100 : 0} />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-primary" />נכנסו למערכת: <b>{progress.done}</b></span>
        <span>בתהליך: <b>{pending}</b></span>
        {progress.failed > 0 && <span className="text-destructive">לא יובאו: <b>{progress.failed}</b></span>}
        <span className="text-muted-foreground">מתוך {progress.total}</span>
      </div>
      {phase === 'done' && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setRuleOpen(true)}><Settings2 className="h-4 w-4" />הגדרת עמלות לנכסים שיובאו</Button>}
      <p className="text-xs text-muted-foreground">הנכסים נשמרים כטיוטות בלשונית הטיוטות. אפשר לערוך עמלה ומחיר לכל נכס בנפרד ולפרסם.</p>
      {unverifiedBroker && <p className="text-xs font-medium text-foreground">הנכסים יישארו ממתינים לפרסום עד לאימות רישיון התיווך בשלב פרטי ההתקשרות.</p>}
    </div>}
    <ImportCommissionDialog open={ruleOpen} onOpenChange={setRuleOpen} count={imported.length} types={dealTypes} rule={rule} onRuleChange={setRule} saving={saving} onApply={accepted => void applyGlobal(accepted)} />
  </CollapsibleCard>;
}
