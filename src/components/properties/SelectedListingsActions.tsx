import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Images, Loader2, Megaphone, Pause, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useUserRole } from '@/hooks/useUserRole';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useDemoViewStatus } from '@/components/demo/DemoViewBar';
import { canRotateFirstTwoPhotos, photoRotationSummary, type PhotoRotationResult } from '@/lib/photoRotation';
import { pauseInventory, publicationErrorMessage } from '@/lib/publishInventory';
import { QuickPublicPromotion } from './QuickPublicPromotion';
import { BulkClosingCommission } from './BulkClosingCommission';
import { PauseDistributionDialog } from './PauseDistributionDialog';

const bare = 'h-8 w-8 border-0 bg-transparent hover:bg-transparent';

/** Icon-only, borderless actions for the selected My Properties rows. */
export function SelectedListingsActions({ ids, liveIds, unconfiguredIds, workspaceId, onPublished, onDelete, onCommissionSaved }: {
  ids: string[]; liveIds: string[]; unconfiguredIds: string[]; workspaceId: string;
  onPublished: (ids: string[], live?: boolean) => void; onDelete: () => void; onCommissionSaved: () => void;
}) {
  const qc = useQueryClient();
  const { isSuperAdmin } = useUserRole();
  const { isDemoMode } = useDemoMode();
  const { type: demoType, loading: demoLoading } = useDemoViewStatus();
  const [pauseOpen, setPauseOpen] = useState(false);
  const [busy, setBusy] = useState<'pause' | 'photos' | null>(null);
  const missing = ids.filter(id => unconfiguredIds.includes(id));
  const live = ids.filter(id => liveIds.includes(id));
  const canRotate = !demoLoading && canRotateFirstTwoPhotos(isSuperAdmin, isDemoMode || !!demoType);

  const pause = async () => {
    setBusy('pause');
    try {
      const saved = await pauseInventory(supabase, workspaceId, live);
      onPublished(saved, false);
      void Promise.all(['properties-search', 'affiliate-configs', 'owner-listings', 'ready-board-properties', 'my-ads-stats', 'affiliate-marketplace', 'public-listings'].map(key => qc.invalidateQueries({ queryKey: [key] })));
      toast.success(saved.length > 1 ? `הפרסום של ${saved.length} נכסים הופסק` : 'הפרסום הופסק. הנכס נשאר בנכסים שלי');
      setPauseOpen(false);
    } catch (error) { toast.error(publicationErrorMessage(error)); }
    finally { setBusy(null); }
  };
  const rotate = async () => {
    if (!window.confirm(`להזיז את 2 התמונות הראשונות לסוף ב־${ids.length} הנכסים שנבחרו? יעודכנו רק נכסים עם יותר משתי תמונות.`)) return;
    setBusy('photos');
    const total: PhotoRotationResult = { listings: 0, projects: 0, apartments: 0, total: 0 };
    let failed = 0;
    for (const id of ids) {
      const { data, error } = await supabase.rpc('admin_rotate_first_two_photos', { _scope: 'listing', _listing_id: id });
      if (error) { failed++; continue; }
      const r = data as PhotoRotationResult;
      total.listings += r.listings; total.projects += r.projects; total.apartments += r.apartments; total.total += r.total;
    }
    setBusy(null);
    toast[failed ? 'warning' : 'success'](failed ? `${photoRotationSummary(total)} · ${failed} נכסים לא עודכנו` : photoRotationSummary(total));
    void Promise.all(['properties-search', 'property-detail', 'listings', 'public-listings'].map(key => qc.invalidateQueries({ queryKey: [key] })));
  };

  return <div className="flex items-center gap-0.5">
    <Button size="icon" variant="ghost" className={`${bare} text-destructive hover:text-destructive`} title="מחיקה של הנבחרים" aria-label="מחיקה של הנבחרים" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
    {missing.length > 0
      ? <BulkClosingCommission ids={missing} workspaceId={workspaceId} onSaved={onCommissionSaved} trigger={open => <Button size="icon" variant="ghost" className={`${bare} text-primary`} title="פרסם בלוח" aria-label="פרסם בלוח" onClick={open}><Megaphone className="h-4 w-4 text-[hsl(var(--brand-red))]" /></Button>} />
      : <QuickPublicPromotion ids={ids} bare onPublished={onPublished} />}
    {live.length > 0 && <Button size="icon" variant="ghost" className={`${bare} text-muted-foreground`} disabled={busy !== null} title="הפסק פרסום" aria-label="הפסק פרסום" onClick={() => setPauseOpen(true)}>{busy === 'pause' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}</Button>}
    {canRotate && <Button size="icon" variant="ghost" className={`${bare} text-muted-foreground`} disabled={busy !== null} title="הזז 2 תמונות ראשונות לסוף" aria-label="הזז 2 תמונות ראשונות לסוף" onClick={() => void rotate()}>{busy === 'photos' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Images className="h-4 w-4" />}</Button>}
    <PauseDistributionDialog open={pauseOpen} busy={busy === 'pause'} onOpenChange={setPauseOpen} onConfirm={() => void pause()} />
  </div>;
}
