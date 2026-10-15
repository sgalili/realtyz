import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Globe, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type PromotionRow = { id: string; property_title: string | null; address: string | null; house_number: string | null; city: string | null; asking_price: number | null; status: string | null; is_published: boolean | null; affiliate_enabled: boolean | null };
export function QuickPublicPromotion({ ids, onPublished, compact = false }: { ids: string[]; onPublished: (ids: string[]) => void; compact?: boolean }) {
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<PromotionRow[]>([]);
  const [accepted, setAccepted] = useState(false);
  const allowed = ['managing_broker', 'lead_agent', 'agent', 'admin', 'super_admin', 'affiliate'].includes(activeWorkspace?.role ?? '');
  useEffect(() => { setOpen(false); setRows([]); setAccepted(false); }, [activeWorkspaceId]);
  if (!allowed || !activeWorkspaceId || !ids.length) return null;
  const eligible = rows.filter(row => row.status !== 'discarded' && !!row.city?.trim() && !!row.address?.trim() && Number(row.asking_price) > 0 && !(row.is_published && row.affiliate_enabled && row.status === 'live'));
  const prepare = async () => {
    setBusy(true); setAccepted(false);
    try {
      const { data, error } = await supabase.from('listings').select('id,property_title,address,house_number,city,asking_price,status,is_published,affiliate_enabled').eq('workspace_owner_id', activeWorkspaceId).in('id', [...new Set(ids)]);
      if (error) throw error;
      setRows(data ?? []); setOpen(true);
    } catch { toast.error('לא ניתן להכין את הנכסים לפרסום'); }
    finally { setBusy(false); }
  };
  const publish = async () => {
    if (!accepted || !eligible.length || busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from('listings').update({ is_published: true, status: 'live', affiliate_enabled: true }).eq('workspace_owner_id', activeWorkspaceId).in('id', eligible.map(row => row.id)).neq('status', 'discarded').select('id');
      if (error) throw error;
      const saved = (data ?? []).map(row => row.id);
      if (!saved.length) throw new Error('לא נשמרו שינויים. יש לבדוק הרשאות לפרסום במשרד הפעיל.');
      onPublished(saved);
      void qc.invalidateQueries({ queryKey: ['my-ads-stats'] });
      void qc.invalidateQueries({ queryKey: ['owner-listings'] });
      toast.success(`${saved.length} נכסים פורסמו בלוח הציבורי`);
      if (saved.length !== eligible.length) toast.warning('חלק מהנכסים לא פורסמו. יש לבדוק הרשאות.');
      setOpen(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'הפרסום נכשל'); }
    finally { setBusy(false); }
  };
  return <>
    <Button variant="outline" size={compact ? 'icon' : 'sm'} className={compact ? 'h-8 w-8 text-primary' : 'gap-1.5'} disabled={busy} title="פרסום בלוח הציבורי" aria-label="פרסום בלוח הציבורי" onClick={(event) => { event.stopPropagation(); void prepare(); }}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}{!compact && 'פרסום בלוח הציבורי'}
    </Button>
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
      <DialogContent dir="rtl" className="sm:max-w-lg" onClick={event => event.stopPropagation()}>
        <DialogHeader><DialogTitle className="text-right">פרסום בלוח הציבורי</DialogTitle><DialogDescription className="text-right">{eligible.length} נכסים מוכנים לפרסום במשרד {activeWorkspace?.workspace_name}</DialogDescription></DialogHeader>
        <div className="max-h-64 overflow-y-auto divide-y divide-border">
          {rows.map(row => <div key={row.id} className="flex items-center gap-2 py-2 text-sm"><BadgeCheck className={`h-4 w-4 shrink-0 ${eligible.some(item => item.id === row.id) ? 'text-success' : 'text-muted-foreground'}`} /><span className="min-w-0 flex-1 truncate">{row.property_title || row.address}</span><span className="shrink-0 text-xs text-muted-foreground">{eligible.some(item => item.id === row.id) ? 'מוכן' : row.is_published && row.affiliate_enabled && row.status === 'live' ? 'כבר פורסם' : 'לא ניתן לפרסם'}</span></div>)}
        </div>
        {eligible.length > 0 && <label className="flex items-start gap-2 text-sm"><Checkbox checked={accepted} onCheckedChange={value => setAccepted(value === true)} /><span>אני מורשה לפרסם את הנכסים ומאשר את פרסומם בלוח הציבורי בהתאם לתקנון.</span></label>}
        <div className="flex flex-wrap items-center gap-2"><Button disabled={busy || !accepted || !eligible.length} onClick={() => void publish()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'אישור ופרסום'}</Button><Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>ביטול</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}
