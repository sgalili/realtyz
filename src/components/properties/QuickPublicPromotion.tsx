import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Globe, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { isReadyForBoard } from '@/lib/readyForBoard';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useUserRole } from '@/hooks/useUserRole';
import { publishInventory, publicationErrorMessage } from '@/lib/publishInventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Public-board status as a bare globe: green when live, gray with a diagonal slash when not. The label is hover-only. */
export function PublishStatusGlobe({ live, busy = false, actionable = false, onClick }: { live: boolean; busy?: boolean; actionable?: boolean; onClick?: (event: ReactMouseEvent) => void }) {
  const label = live ? 'מפורסם בלוח הציבורי' : actionable ? 'לא מפורסם בלוח הציבורי — לחיצה תפתח את חלון הפרסום' : 'לא מפורסם בלוח הציבורי';
  const icon = (
    <span className={cn('relative inline-flex h-5 w-5 shrink-0 items-center justify-center', live ? 'text-success' : 'text-muted-foreground opacity-60')}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Globe className="h-4 w-4" aria-hidden="true" />}
      {!live && !busy && <span aria-hidden="true" className="pointer-events-none absolute h-[1.5px] w-[19px] -rotate-45 rounded-full bg-current" />}
    </span>
  );
  const body = onClick
    ? <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={label} onClick={onClick}>{icon}</Button>
    : <span role="img" aria-label={label} className="inline-flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>;
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>{body}</TooltipTrigger>
      <TooltipContent side="top" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}

type PromotionRow = { id: string; property_title: string | null; address: string | null; house_number: string | null; city: string | null; asking_price: number | null; status: string | null; is_published: boolean | null; affiliate_enabled: boolean | null; deal_type?: string | null; affiliate_tier1_amount?: number | null; affiliate_tier2_amount?: number | null; affiliate_tier3_amount?: number | null; affiliate_tier4_amount?: number | null; affiliate_tier4_type?: string | null };
type FeeDraft = { t1: string; t2: string; t3: string; t4: string };
const FEE_FIELDS = [['t4', 'אומדן סגירה'], ['t1', 'ליד טופס'], ['t2', 'ליד וואטסאפ'], ['t3', 'ליד שיחה']] as const;
const feeDraft = (r: PromotionRow): FeeDraft => ({ t1: String(r.affiliate_tier1_amount ?? 0), t2: String(r.affiliate_tier2_amount ?? 0), t3: String(r.affiliate_tier3_amount ?? 0), t4: String(r.affiliate_tier4_amount ?? 0) });
export function QuickPublicPromotion({ ids, onPublished, compact = false, statusLive, fallback }: { ids: string[]; onPublished: (ids: string[]) => void; compact?: boolean; statusLive?: boolean; fallback?: ReactNode }) {
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { roles, loading: rolesLoading } = useUserRole();
  const scopeRef = useRef(activeWorkspaceId);
  scopeRef.current = activeWorkspaceId;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<PromotionRow[]>([]);
  const [accepted, setAccepted] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, FeeDraft>>({});
  // Membership roles may remain "user" after the owner's broker approval.
  // Use server-backed owner/account roles; RLS remains the write boundary.
  const allowed = !rolesLoading && roles.some(role => ['managing_broker', 'lead_agent', 'agent', 'admin', 'super_admin', 'affiliate'].includes(role));
  useEffect(() => { setOpen(false); setRows([]); setAccepted(false); setBusy(false); }, [activeWorkspaceId]);
  if (!allowed || !activeWorkspaceId || !ids.length) return <>{fallback ?? null}</>;
  const eligible = rows.filter(isReadyForBoard);
  const prepare = async () => {
    const workspaceId = activeWorkspaceId;
    setBusy(true); setAccepted(false);
    try {
      const { data, error } = await supabase.from('listings').select('id,property_title,address,house_number,city,asking_price,status,is_published,affiliate_enabled,deal_type,affiliate_tier1_amount,affiliate_tier2_amount,affiliate_tier3_amount,affiliate_tier4_amount,affiliate_tier4_type').eq('workspace_owner_id', activeWorkspaceId).in('id', [...new Set(ids)]);
      if (error) throw error;
      if (scopeRef.current !== workspaceId) return;
      if (!data?.length) throw new Error('הנכס לא נמצא במשרד הפעיל או שאין הרשאה לצפות בו.');
      setRows(data as PromotionRow[]); setDrafts(Object.fromEntries((data as PromotionRow[]).map(r => [r.id, feeDraft(r)]))); setOpen(true);
    } catch (error) {
      console.error('[QuickPublicPromotion] prepare failed', { workspaceId, listingIds: ids, error });
      if (scopeRef.current === workspaceId) toast.error(publicationErrorMessage(error));
    }
    finally { if (scopeRef.current === workspaceId) setBusy(false); }
  };
  const publish = async () => {
    if (!accepted || !eligible.length || busy) return;
    const workspaceId = activeWorkspaceId;
    setBusy(true);
    try {
      for (const row of eligible) {
        const d = drafts[row.id]; if (!d) continue;
        const orig = feeDraft(row);
        if ((Object.keys(d) as (keyof FeeDraft)[]).every(k => Number(d[k]) === Number(orig[k]))) continue;
        const nums = [d.t1, d.t2, d.t3, d.t4].map(Number);
        if (nums.some(n => !Number.isFinite(n) || n < 0) || nums[3] <= 0) throw new Error('יש להזין עמלות תקינות. אומדן הסגירה חייב להיות גדול מאפס.');
        const { data: upd, error: updError } = await supabase.from('listings').update({ affiliate_tier1_amount: nums[0], affiliate_tier2_amount: nums[1], affiliate_tier3_amount: nums[2], affiliate_tier4_amount: nums[3] }).eq('workspace_owner_id', workspaceId).eq('id', row.id).select('id').maybeSingle();
        if (updError || !upd) throw updError ?? new Error('לא ניתן לשמור את העמלות לנכס.');
      }
      void qc.invalidateQueries({ queryKey: ['affiliate-configs'] });
      const saved = await publishInventory(supabase, workspaceId, eligible.map(row => row.id));
      if (scopeRef.current !== workspaceId) return;
      onPublished(saved);
      void qc.invalidateQueries({ queryKey: ['my-ads-stats'] });
      void qc.invalidateQueries({ queryKey: ['owner-listings'] });
      void qc.invalidateQueries({ queryKey: ['ready-board-properties'] });
      void qc.invalidateQueries({ queryKey: ['properties-total-count'] });
      void qc.invalidateQueries({ queryKey: ['affiliate-marketplace'] });
      toast.success(`${saved.length} נכסים פורסמו בלוח הציבורי`);
      if (saved.length !== eligible.length) toast.warning('חלק מהנכסים לא פורסמו. יש לבדוק הרשאות.');
      setOpen(false);
    } catch (error) {
      console.error('[QuickPublicPromotion] publish failed', { workspaceId, listingIds: eligible.map(row => row.id), error });
      if (scopeRef.current === workspaceId) toast.error(publicationErrorMessage(error));
    }
    finally { if (scopeRef.current === workspaceId) setBusy(false); }
  };
  return <>
    {compact && statusLive !== undefined ? (
      <PublishStatusGlobe live={statusLive} busy={busy} actionable={!statusLive} onClick={(event) => { event.stopPropagation(); void prepare(); }} />
    ) : (
      <Button variant="outline" size={compact ? 'icon' : 'sm'} className={compact ? 'h-8 w-8 text-primary' : 'gap-1.5'} disabled={busy} title="פרסום בלוח הציבורי" aria-label="פרסום בלוח הציבורי" onClick={(event) => { event.stopPropagation(); void prepare(); }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}{!compact && 'פרסום בלוח הציבורי'}
      </Button>
    )}
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-lg" onClick={event => event.stopPropagation()}>
        <DialogHeader><DialogTitle className="text-right">פרסום בלוח הציבורי</DialogTitle><DialogDescription className="text-right">{eligible.length} נכסים מוכנים לפרסום במשרד {activeWorkspace?.workspace_name}</DialogDescription></DialogHeader>
        <div className="max-h-64 overflow-y-auto divide-y divide-border">
          {rows.map(row => <div key={row.id} className="flex items-center gap-2 py-2 text-sm"><BadgeCheck className={`h-4 w-4 shrink-0 ${eligible.some(item => item.id === row.id) ? 'text-success' : 'text-muted-foreground'}`} /><span className="min-w-0 flex-1 break-words">{row.property_title || row.address}</span><span className="shrink-0 text-xs text-muted-foreground">{eligible.some(item => item.id === row.id) ? 'מוכן' : row.is_published && row.affiliate_enabled && row.status === 'live' ? 'כבר פורסם' : 'לא ניתן לפרסם'}</span></div>)}
        </div>
        {eligible.length > 0 && <div className="space-y-2 rounded-md border p-3 text-sm">
          <div className="font-medium">עמלות ותמחור לידים</div>
          {eligible.map(row => { const d = drafts[row.id] ?? feeDraft(row); const unit = (k: string) => k === 't4' && row.affiliate_tier4_type === 'percent' ? '%' : '₪'; return (
            <div key={row.id} className="space-y-1">
              {eligible.length > 1 && <div className="text-xs text-muted-foreground">{row.property_title || row.address}</div>}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">{FEE_FIELDS.map(([k, label]) => <span key={k}>{label}: <b>{unit(k) === '%' ? `${d[k]}%` : `₪${Number(d[k] || 0).toLocaleString('he-IL')}`}</b></span>)}</div>
            </div>); })}
          <details className="group rounded-md bg-muted/40 px-2 py-1">
            <summary className="cursor-pointer select-none py-1 text-primary">עריכת עמלת סגירה ומחירי לידים</summary>
            <div className="space-y-3 py-2">
              {eligible.map(row => { const d = drafts[row.id] ?? feeDraft(row); return (
                <div key={row.id} className="space-y-1">
                  {eligible.length > 1 && <div className="text-xs font-medium">{row.property_title || row.address}</div>}
                  <div className="grid grid-cols-2 gap-2">{FEE_FIELDS.map(([k, label]) => <label key={k} className="space-y-0.5 text-xs"><span>{label}{k === 't4' && row.affiliate_tier4_type === 'percent' ? ' (%)' : ' (₪)'}</span><Input type="number" min={0} step={k === 't4' && row.affiliate_tier4_type === 'percent' ? 0.01 : 1} dir="ltr" value={d[k]} disabled={busy} onChange={e => setDrafts(prev => ({ ...prev, [row.id]: { ...d, [k]: e.target.value } }))} /></label>)}</div>
                </div>); })}
            </div>
          </details>
        </div>}
        {eligible.length > 0 && <label className="flex items-start gap-2 text-sm"><Checkbox checked={accepted} onCheckedChange={value => setAccepted(value === true)} /><span>אני מורשה לפרסם את הנכסים ומאשר את פרסומם בלוח הציבורי בהתאם לתקנון.</span></label>}
        <div className="flex items-center justify-between gap-2"><Button disabled={busy || !accepted || !eligible.length} onClick={() => void publish()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'אישור ופרסום'}</Button><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>ביטול</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}
