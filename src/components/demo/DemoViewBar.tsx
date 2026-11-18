import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DEMO_TYPES, isDemoType, type DemoType } from '@/pages/demo/demoData';
import { DEMO_HOME, installDemoWriteGuard, removeDemoWriteGuard, startDemoSession } from '@/lib/demoView';
import { toast } from 'sonner';

const LIVE_EVENTS = [
  'Rita פרסמה פוסט חדש ב־12 קבוצות',
  'ליד מסונן חדש: מתעניין בדירת 4 חדרים',
  'Rita ענתה לתגובה בפייסבוק',
  'שותף שיתף נכס בוואטסאפ',
  'צפייה חדשה בנכס ברמת גן',
  'נקבעה שיחת המשך עם קונה',
];

/** Server-confirmed demo account type of the signed-in session, or null. */
export function useDemoViewType(): DemoType | null {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['demo-view-type', user?.id ?? null],
    enabled: !!user?.id,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_demo_view_type');
      if (error) return null;
      return isDemoType(data as string) ? (data as DemoType) : null;
    },
  });
  return user?.id ? data ?? null : null;
}

export function DemoViewBar() {
  const type = useDemoViewType();
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!type) { removeDemoWriteGuard(); return; }
    installDemoWriteGuard();
    const t = setInterval(() => setTick((v) => v + 1), 3000);
    return () => clearInterval(t);
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
  const exit = async () => {
    removeDemoWriteGuard();
    await supabase.auth.signOut().catch(() => undefined);
    navigate('/auth', { replace: true });
  };

  return (
    <div dir="rtl" role="region" aria-label="מצב דמו" className="sticky top-0 z-[60] border-b border-border bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-3 py-1.5 text-sm">
        <span className="flex items-center gap-1 font-semibold"><Eye className="h-4 w-4" />מצב דמו · צפייה בלבד</span>
        <Select value={type} onValueChange={switchTo} disabled={busy}>
          <SelectTrigger aria-label="החלפת סוג משתמש בדמו" className="h-7 w-auto gap-1 border-primary-foreground/40 bg-transparent text-primary-foreground"><SelectValue /></SelectTrigger>
          <SelectContent dir="rtl">{DEMO_TYPES.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
        </Select>
        <span className="hidden min-w-0 flex-1 truncate opacity-90 md:block" aria-live="polite">
          <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-primary-foreground" />{LIVE_EVENTS[tick % LIVE_EVENTS.length]}
        </span>
        {(type === 'marketing' || type === 'developer') && <Button size="sm" variant="ghost" className="h-7 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" onClick={() => navigate('/our-clients')}>יזמים ופרויקטים</Button>}
        <Button size="sm" variant="secondary" className="mr-auto h-7" onClick={exit}>צא ממצב דמו ועבור לחשבון לייב מאומת</Button>
      </div>
    </div>
  );
}
