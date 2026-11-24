import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { usePlatformMode, type PlatformMode } from '@/hooks/usePlatformMode';

export function PlatformModeToggle() {
  const qc = useQueryClient();
  const { data: mode, isLoading } = usePlatformMode();
  const save = useMutation({
    mutationFn: async (next: PlatformMode) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.from('platform_system_settings')
        .update({ platform_mode: next, updated_at: new Date().toISOString(), updated_by: u.user?.id ?? null })
        .eq('id', true).select('platform_mode').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('אין הרשאה לשנות את מצב הפלטפורמה');
      return data.platform_mode as PlatformMode;
    },
    onSuccess: (m) => { qc.setQueryData(['platform-mode'], m); toast.success(m === 'brokers_only' ? 'הפלטפורמה במצב מתווכים בלבד' : 'הלוח הציבורי והשותפים הופעלו'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const full = mode === 'full_marketplace';
  return (
    <Card><CardContent className="flex items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <p className="font-bold">מצב פלטפורמה</p>
        <p className="text-sm text-muted-foreground">{full ? 'שוק מלא: לוח ציבורי + שותפים' : 'מתווכים בלבד (SaaS)'}</p>
      </div>
      <Switch aria-label="הפעלת לוח ציבורי ושותפים" checked={full} disabled={isLoading || save.isPending}
        onCheckedChange={(v) => save.mutate(v ? 'full_marketplace' : 'brokers_only')} />
    </CardContent></Card>
  );
}
