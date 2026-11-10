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

type PromotionRow = { id: string; property_title: string | null; address: string | null; house_number: string | null; city: string | null; asking_price: number | null; status: string | null; is_published: boolean | null; affiliate_enabled: boolean | null };
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
      const { data, error } = await supabase.from('listings').select('id,property_title,address,house_number,city,asking_price,status,is_published,affiliate_enabled').eq('workspace_owner_id', activeWorkspaceId).in('id', [...new Set(ids)]);
      if (error) throw error;
      if (scopeRef.current !== workspaceId) return;
      if (!data?.length) throw new Error('הנכס לא נמצא במשרד הפעיל או שאין הרשאה לצפות בו.');
      setRows(data); setOpen(true);
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
      <DialogContent dir="rtl" className="sm:max-w-lg" onClick={event => event.stopPropagation()}>
        <DialogHeader><DialogTitle className="text-right">פרסום בלוח הציבורי</DialogTitle><DialogDescription className="text-right">{eligible.length} נכסים מוכנים לפרסום במשרד {activeWorkspace?.workspace_name}</DialogDescription></DialogHeader>
        <div className="max-h-64 overflow-y-auto divide-y divide-border">
          {rows.map(row => <div key={row.id} className="flex items-center gap-2 py-2 text-sm"><BadgeCheck className={`h-4 w-4 shrink-0 ${eligible.some(item => item.id === row.id) ? 'text-success' : 'text-muted-foreground'}`} /><span className="min-w-0 flex-1 break-words">{row.property_title || row.address}</span><span className="shrink-0 text-xs text-muted-foreground">{eligible.some(item => item.id === row.id) ? 'מוכן' : row.is_published && row.affiliate_enabled && row.status === 'live' ? 'כבר פורסם' : 'לא ניתן לפרסם'}</span></div>)}
        </div>
        {eligible.length > 0 && <label className="flex items-start gap-2 text-sm"><Checkbox checked={accepted} onCheckedChange={value => setAccepted(value === true)} /><span>אני מורשה לפרסם את הנכסים ומאשר את פרסומם בלוח הציבורי בהתאם לתקנון.</span></label>}
        <div className="flex flex-wrap items-center gap-2"><Button disabled={busy || !accepted || !eligible.length} onClick={() => void publish()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'אישור ופרסום'}</Button><Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>ביטול</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}
