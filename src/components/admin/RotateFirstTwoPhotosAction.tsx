import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Images, Loader2, MoreVertical } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useDemoViewStatus } from '@/components/demo/DemoViewBar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { canRotateFirstTwoPhotos, photoRotationConfirmation, photoRotationRpcArgs, photoRotationSummary, type PhotoRotationResult, type PhotoRotationScope } from '@/lib/photoRotation';

const REFRESH_QUERIES = ['developer-projects', 'property-detail', 'listings', 'properties-search', 'public-listings', 'my-ads-stats', 'broker-contact-queue'];

type Props = { scope: PhotoRotationScope; standalone?: boolean; onCompleted?: (result: PhotoRotationResult) => void };

/** The only UI entry point for the scoped first-two-photo rotation. Hidden for demo and every non-Super-Admin account. */
export function RotateFirstTwoPhotosAction({ scope, standalone = false, onCompleted }: Props) {
  const { isSuperAdmin } = useUserRole();
  const { isDemoMode } = useDemoMode();
  const { type: demoViewType, loading: demoViewLoading } = useDemoViewStatus();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (demoViewLoading || !canRotateFirstTwoPhotos(isSuperAdmin, isDemoMode || !!demoViewType)) return null;

  const run = async () => {
    if (busy || !window.confirm(photoRotationConfirmation(scope))) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('admin_rotate_first_two_photos', photoRotationRpcArgs(scope));
      if (error) throw error;
      const result = data as PhotoRotationResult;
      toast.success(photoRotationSummary(result));
      await Promise.all(REFRESH_QUERIES.map(queryKey => qc.invalidateQueries({ queryKey: [queryKey] })));
      onCompleted?.(result);
    } catch (error) {
      toast.error(error instanceof Error && error.message !== 'forbidden' ? error.message : 'אין הרשאה לבצע את הפעולה או שהפעולה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const item = <DropdownMenuItem className="gap-2" disabled={busy} onSelect={event => { event.preventDefault(); void run(); }}>
    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Images className="h-4 w-4" />}
    {busy ? 'מעביר תמונות…' : 'העבר 2 תמונות ראשונות לסוף'}
  </DropdownMenuItem>;

  if (!standalone) return item;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 sm:h-8 sm:w-8" aria-label={`פעולות תמונות של ${scope.label}`} title="פעולות תמונות" disabled={busy}><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-64" onClick={event => event.stopPropagation()}>{item}</DropdownMenuContent>
  </DropdownMenu>;
}
