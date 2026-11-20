import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DEMO_TYPES, isDemoType, type DemoType } from '@/pages/demo/demoData';
import { DEMO_HOME, installDemoWriteGuard, removeDemoWriteGuard, startDemoSession } from '@/lib/demoView';
import { toast } from 'sonner';

/** Server-confirmed demo account status of the signed-in session. */
export function useDemoViewStatus(): { type: DemoType | null; loading: boolean } {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['demo-view-type', user?.id ?? null],
    enabled: !!user?.id,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_demo_view_type');
      if (error) return null;
      return isDemoType(data as string) ? (data as DemoType) : null;
    },
  });
  return { type: user?.id ? data ?? null : null, loading: !!user?.id && isLoading };
}

export function useDemoViewType(): DemoType | null {
  return useDemoViewStatus().type;
}

export function DemoViewBar() {
  const type = useDemoViewType();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!type) { removeDemoWriteGuard(); return; }
    installDemoWriteGuard();
  }, [type]);

  if (!type) return null;

  const switchTo = async (next: string) => {
    if (!isDemoType(next) || next === type) return;
    setBusy(true);
    try {
      removeDemoWriteGuard();
      await startDemoSession(next);
      navigate(DEMO_HOME[next], { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'לא ניתן לעבור לדמו');
    } finally { setBusy(false); }
  };

  return (
    <div dir="rtl" role="region" aria-label="מצב דמו" className="sticky top-0 z-[60] border-b border-border bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-3 py-1.5 text-sm">
        <span className="flex items-center gap-1 font-semibold"><Eye className="h-4 w-4" />מצב דמו · צפייה בלבד</span>
        <Select value={type} onValueChange={switchTo} disabled={busy}>
          <SelectTrigger aria-label="החלפת סוג משתמש בדמו" className="h-7 w-auto gap-1 border-primary-foreground/40 bg-transparent text-primary-foreground"><SelectValue /></SelectTrigger>
          <SelectContent dir="rtl">{DEMO_TYPES.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
  );
}
