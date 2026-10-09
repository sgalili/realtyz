import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Hourglass, PauseCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

export const LIFECYCLE_STAGES = [
  { key: 'uploaded', label: 'הועלה' },
  { key: 'distributed', label: 'בהפצה' },
  { key: 'inquiry', label: 'פניות' },
  { key: 'tour_scheduled', label: 'סיור נקבע' },
  { key: 'tour_completed', label: 'סיור בוצע' },
  { key: 'negotiation', label: 'משא ומתן' },
  { key: 'contract', label: 'חוזה' },
  { key: 'closed', label: 'נסגר' },
] as const;

type LifecycleRow = {
  lifecycle_stage: string; last_activity_at: string; availability_check_sent_at: string | null;
  availability_check_count: number; availability_confirmed_at: string | null; distribution_paused: boolean;
};

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) : '');

/** Live lifecycle progress + automated availability-check status for one listing. */
export default function ListingLifecycleStatus({ listingId, canManage = true, className }: { listingId: string; canManage?: boolean; className?: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['listing-lifecycle', listingId],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.from('listings')
        .select('lifecycle_stage, last_activity_at, availability_check_sent_at, availability_check_count, availability_confirmed_at, distribution_paused')
        .eq('id', listingId).maybeSingle();
      if (error) throw error;
      return data as LifecycleRow | null;
    },
  });
  if (!data) return null;
  const idx = Math.max(0, LIFECYCLE_STAGES.findIndex((s) => s.key === data.lifecycle_stage));
  const stage = LIFECYCLE_STAGES[idx];
  const waiting = !data.distribution_paused && data.availability_check_count > 0;

  const confirm = async () => {
    const { error } = await supabase.rpc('confirm_listing_availability', { _listing: listingId, _available: true });
    if (error) { toast.error('אישור הזמינות נכשל'); return; }
    toast.success(data.distribution_paused ? 'הזמינות אושרה וההפצה חודשה' : 'הזמינות אושרה');
    void qc.invalidateQueries({ queryKey: ['listing-lifecycle', listingId] });
  };

  return (
    <div className={cn('space-y-1.5', className)} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{stage.label}</span>
        <div className="flex flex-1 gap-0.5" aria-label={`שלב ${idx + 1} מתוך ${LIFECYCLE_STAGES.length}: ${stage.label}`} role="img">
          {LIFECYCLE_STAGES.map((s, i) => (
            <span key={s.key} title={s.label} className={cn('h-1.5 flex-1 rounded-full', i <= idx ? 'bg-primary' : 'bg-muted')} />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {data.distribution_paused ? (
          <span className="flex items-center gap-1 font-medium text-destructive"><PauseCircle className="h-3.5 w-3.5" />ההפצה לשותפים הושהתה, ממתין לאישור זמינות</span>
        ) : waiting ? (
          <span className="flex items-center gap-1 font-medium text-warning"><Hourglass className="h-3.5 w-3.5 animate-pulse" />ריטה ביקשה אישור זמינות ({data.availability_check_count}/3) · {fmt(data.availability_check_sent_at)}</span>
        ) : (
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-success" />{data.availability_confirmed_at ? `זמינות אושרה ${fmt(data.availability_confirmed_at)}` : `פעילות אחרונה ${fmt(data.last_activity_at)}`}</span>
        )}
        {canManage && stage.key !== 'closed' && (data.distribution_paused || waiting) && (
          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => void confirm()}>הנכס עדיין זמין</Button>
        )}
      </div>
    </div>
  );
}
