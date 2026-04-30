import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Activity, CheckCircle, XCircle, Loader2, MessageSquare, Database } from 'lucide-react';

interface StatusItem {
  label: string;
  ok: boolean | null; // null = loading
  icon: React.ElementType;
}

const SystemHealthIndicator = () => {
  // Check Supabase connection
  const { data: dbOk, isLoading: dbLoading } = useQuery({
    queryKey: ['health-db'],
    queryFn: async () => {
      try {
        const { error } = await supabase.from('leads').select('id', { count: 'exact', head: true });
        return !error;
      } catch {
        return false;
      }
    },
    refetchInterval: 30_000,
  });

  // Check messaging gateway status
  const { data: waOk, isLoading: waLoading } = useQuery({
    queryKey: ['health-wa'],
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from('api_configs')
          .select('is_active')
          .eq('service_name', 'WhatsApp Gateway')
          .maybeSingle();
        return data?.is_active ?? false;
      } catch {
        return false;
      }
    },
    refetchInterval: 30_000,
  });

  const statuses: StatusItem[] = [
    { label: 'מסד נתונים', ok: dbLoading ? null : (dbOk ?? false), icon: Database },
    { label: 'WhatsApp Gateway', ok: waLoading ? null : (waOk ?? false), icon: MessageSquare },
  ];

  const allOk = statuses.every((s) => s.ok === true);
  const anyLoading = statuses.some((s) => s.ok === null);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Activity className="h-4 w-4" />
          <span
            className={`absolute top-1.5 left-1.5 h-2 w-2 rounded-full ${
              anyLoading ? 'bg-amber-500 animate-pulse' : allOk ? 'bg-emerald-500' : 'bg-destructive'
            }`}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3" dir="rtl">
        <p className="text-xs font-semibold mb-3 flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-primary" />
          בריאות מערכת
        </p>
        <div className="space-y-2">
          {statuses.map((s) => (
            <div key={s.label} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{s.label}</span>
              </div>
              {s.ok === null ? (
                <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin" />
              ) : s.ok ? (
                <div className="flex items-center gap-1 text-emerald-500">
                  <CheckCircle className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-medium">LIVE</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-destructive">
                  <XCircle className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-medium">OFFLINE</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default SystemHealthIndicator;
