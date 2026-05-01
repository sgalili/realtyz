import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type StatusRow = {
  integration: string;
  status: 'operational' | 'warning' | 'degraded';
  recent_failures: number;
  last_failure_at: string | null;
};

const LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  homely: 'Homely',
  transcription: 'תמלול',
  ai_gateway: 'AI',
  email_queue: 'דוא״ל',
};

export function SystemStatus() {
  const { data } = useQuery({
    queryKey: ['system-status'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_system_status');
      if (error) throw error;
      return (data ?? []) as StatusRow[];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const rows = data ?? [];
  const overall: StatusRow['status'] =
    rows.some((r) => r.status === 'degraded')
      ? 'degraded'
      : rows.some((r) => r.status === 'warning')
      ? 'warning'
      : 'operational';

  const dot =
    overall === 'operational'
      ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]'
      : overall === 'warning'
      ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]'
      : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]';

  const label =
    overall === 'operational'
      ? 'המערכת תקינה'
      : overall === 'warning'
      ? 'תקלה קלה באינטגרציה'
      : 'תקלה במערכת';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          dir="rtl"
          className="flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1.5 text-[11px] text-muted-foreground transition hover:bg-accent/40"
          aria-label="סטטוס מערכת"
        >
          <span className={cn('h-2 w-2 rounded-full transition', dot)} />
          <span className="font-medium">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent dir="rtl" align="end" className="w-64 p-3 text-right">
        <p className="mb-2 text-xs font-bold text-foreground">סטטוס אינטגרציות</p>
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.integration} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">{LABEL[r.integration] ?? r.integration}</span>
              <span className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    r.status === 'operational' && 'bg-emerald-500',
                    r.status === 'warning' && 'bg-amber-400',
                    r.status === 'degraded' && 'bg-red-500',
                  )}
                />
                <span className="font-medium">
                  {r.status === 'operational' ? 'תקין' : r.status === 'warning' ? 'אזהרה' : 'תקלה'}
                </span>
              </span>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="text-xs text-muted-foreground">אין נתונים זמינים</li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
