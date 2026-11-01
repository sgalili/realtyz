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
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { importCommissionPayload, readImportRule, saveImportRule, runPool, type ImportCommissionRule } from '@/lib/importCommissionDefaults';
import { agencyUrlForRequest, isYad2AgencyUrl } from '@/lib/yad2ImportLinks';


const BROKER_ROLES = ['managing_broker', 'agent', 'lead_agent', 'junior_agent', 'super_admin'];
const PARALLEL = 4;

type ImportProgress = { total: number; done: number; failed: number; running: number };

async function errorText(error: unknown) {
  if (error instanceof FunctionsHttpError) { try { const b = await error.context.json(); return b?.message || b?.detail || b?.error || 'שגיאה'; } catch { /* ignore */ } }
  return error instanceof Error ? error.message : 'שגיאה';
}

/** Applies a commission rule to one workspace listing, merging the closing fee into its features. */
async function applyRule(listingId: string, workspaceId: string, rule: ImportCommissionRule, onlyIfUnset: boolean) {
  const { data: row } = await supabase.from('listings').select('id, deal_type, asking_price, features, affiliate_tier1_amount, affiliate_tier2_amount, affiliate_tier3_amount, affiliate_tier4_amount').eq('id', listingId).eq('workspace_owner_id', workspaceId).maybeSingle();
  if (!row) return;
  if (onlyIfUnset && (row.affiliate_tier1_amount || row.affiliate_tier2_amount || row.affiliate_tier3_amount || row.affiliate_tier4_amount)) return;
  const feature = Array.isArray(row.features) ? (row.features[0] ?? {}) : (row.features ?? {});
  const dealType = (feature as { listing_type?: string }).listing_type ?? row.deal_type;
  const { closing, ...columns } = importCommissionPayload(dealType, Number(row.asking_price) || 0, rule);
  await supabase.from('listings').update({ ...columns, features: { ...(feature as object), deal_closing_commission: closing } } as never).eq('id', listingId).eq('workspace_owner_id', workspaceId);
}


import { savePendingYad2Import, readPendingYad2Import, clearPendingYad2Import } from '@/lib/pendingYad2Import';

export default function Yad2AgencyImport({ publisherType = 'broker' }: { publisherType?: string }) {

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
  const [rule, setRule] = useState<ImportCommissionRule>(() => (user && activeWorkspaceId ? readImportRule(user.id, activeWorkspaceId) : readImportRule('', '')));
  const scope = useRef(0);

  useEffect(() => {
    scope.current++; setPhase('idle'); setImported([]); setProgress({ total: 0, done: 0, failed: 0, running: 0 });
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
    const run = ++scope.current, ws = activeWorkspaceId, activeRule = rule;
    setPhase('discovering'); setImported([]);
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
        if (!e && res?.listing_id) { id = res.listing_id; await applyRule(id!, ws, activeRule, true); }
      } catch { id = null; }
      if (run !== scope.current) return;
      setProgress(p => ({ ...p, running: p.running - 1, done: p.done + (id ? 1 : 0), failed: p.failed + (id ? 0 : 1) }));
      if (id) { setImported(list => [...list, id!]); refresh(); }
    });
    if (run !== scope.current) return;
    setPhase('done'); setRuleOpen(true);
  };

  const applyGlobal = async () => {
    if (!user || !activeWorkspaceId) return;
    saveImportRule(user.id, activeWorkspaceId, rule);
    await runPool(imported, PARALLEL, id => applyRule(id, activeWorkspaceId, rule, false));
    refresh(); setRuleOpen(false);
    toast.success(`העמלות עודכנו ב-${imported.length} נכסים`);
  };

  const busy = phase === 'discovering' || phase === 'importing';
  const pending = progress.total - progress.done - progress.failed;
  const num = (k: keyof ImportCommissionRule) => (e: React.ChangeEvent<HTMLInputElement>) => setRule(r => ({ ...r, [k]: Math.max(0, Number(e.target.value.replace(/[^\d.]/g, '')) || 0) }));

  return <section dir="rtl" className="space-y-3 rounded-xl border bg-card p-4">
    <h2 className="text-[17px] font-semibold">יבוא כל המודעות שלי מיד 2</h2>
    <p className="text-[13.5px] leading-6 text-muted-foreground">יש לכם עמוד משרד ביד שתיים? הדביקו את הקישור הראשי שלו וכל המודעות שפרסמתם יובאו בלחיצה אחת.</p>
    <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.yad2.co.il/realestate/agency/..." dir="ltr" disabled={busy} className="text-[16px] placeholder:text-muted-foreground/50" />
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
    <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>הייבוא הסתיים: {progress.done} נכסים</DialogTitle>
          <DialogDescription>הגדירו כלל עמלות אחד לכל הנכסים שיובאו ולייבואים הבאים. אפשר לשנות כל נכס בנפרד בהמשך.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>עמלת סגירה במכירה (%)</Label><Input inputMode="decimal" value={rule.salePercent} onChange={num('salePercent')} /></div>
          <div className="space-y-1"><Label>עמלת סגירה בשכירות (% משכר דירה חודשי)</Label><Input inputMode="decimal" value={rule.rentMonthlyPercent} onChange={num('rentMonthlyPercent')} /></div>
          <div className="space-y-1"><Label>פנייה בטופס (₪)</Label><Input inputMode="numeric" value={rule.form} onChange={num('form')} /></div>
          <div className="space-y-1"><Label>פנייה בוואטסאפ (₪)</Label><Input inputMode="numeric" value={rule.whatsapp} onChange={num('whatsapp')} /></div>
          <div className="space-y-1"><Label>שיחת טלפון (₪)</Label><Input inputMode="numeric" value={rule.phone} onChange={num('phone')} /></div>
        </div>
        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => setRuleOpen(false)}>אחר כך</Button>
          <Button onClick={() => void applyGlobal()} disabled={!imported.length}>החלה על כל הנכסים</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
