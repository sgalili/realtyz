import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useMonthlyFreeCredits } from '@/hooks/useMonthlyFreeCredits';
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
  return (<div className="space-y-3">
    <Card><CardContent className="flex items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <p className="font-bold">מצב פלטפורמה</p>
        <p className="text-sm text-muted-foreground">{full ? 'שוק מלא: לוח ציבורי + שותפים' : 'מתווכים בלבד (SaaS)'}</p>
      </div>
      <Switch aria-label="הפעלת לוח ציבורי ושותפים" checked={full} disabled={isLoading || save.isPending}
        onCheckedChange={(v) => save.mutate(v ? 'full_marketplace' : 'brokers_only')} />
    </CardContent></Card>
    <MonthlyFreeCreditsSetting />
  </div>);
}

/** Super Admin-only: the monthly free credits top-up; the server grant reads the same saved value. */
function MonthlyFreeCreditsSetting() {
  const qc = useQueryClient();
  const query = useMonthlyFreeCredits();
  const [value, setValue] = useState('');
  useEffect(() => { if (query.data !== undefined) setValue(String(query.data)); }, [query.data]);
  const n = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 100000;
  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.from('platform_system_settings')
        .update({ monthly_free_credits: n, updated_at: new Date().toISOString(), updated_by: u.user?.id ?? null })
        .eq('id', true).select('monthly_free_credits').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('אין הרשאה לשנות את הקרדיטים החודשיים');
      return Number(data.monthly_free_credits);
    },
    onSuccess: (v) => { qc.setQueryData(['monthly-free-credits'], v); toast.success(`נשמר: ${v} קרדיטים חינם בחודש`); },
    onError: (e: Error) => toast.error(e.message),
  });
  return <Card><CardContent className="flex flex-wrap items-end justify-between gap-3 p-4">
    <div className="min-w-0 space-y-1">
      <label htmlFor="monthly-free-credits" className="font-bold">קרדיטים חינם בכל חודש</label>
      <p className="text-sm text-muted-foreground">היתרה של כל משתמש מושלמת לסכום הזה בתחילת כל חודש. קרדיטים שנרכשו נשמרים.</p>
    </div>
    <div className="flex items-center gap-2">
      <Input id="monthly-free-credits" type="number" dir="ltr" min={0} max={100000} className="w-24" value={value} onChange={e => setValue(e.target.value)} />
      <Button onClick={() => save.mutate()} disabled={!valid || save.isPending || query.isLoading}>שמירה</Button>
    </div>
  </CardContent></Card>;
}
