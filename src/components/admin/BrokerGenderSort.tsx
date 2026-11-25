import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Venus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useSuperAdminGate } from '@/hooks/useSuperAdminGate';
type Classification = { processed: number; saved: number; skipped: number; remaining: number };
export function BrokerGenderSort() {
  const gate = useSuperAdminGate();
  const qc = useQueryClient();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const key = ['broker-gender-remaining', gate.uid];
  const read = async (process: boolean) => {
    const { data, error } = await supabase.rpc('admin_classify_verified_broker_genders', { _process: process }).abortSignal(AbortSignal.timeout(15000));
    if (error) throw error;
    return data as Classification;
  };
  const status = useQuery({ queryKey: key, enabled: gate.enabled, queryFn: () => read(false), staleTime: 30000, refetchInterval: 60000 });
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const autoRan = useRef(false);
  const run = async (silent = false) => {
    if (busy || !gate.enabled) return;
    setBusy(true);
    let done = 0, saved = 0, skipped = 0;
    try {
      const initial = await read(false);
      const total = initial.remaining;
      setProgress({ done: 0, total });
      while (alive.current && done < total) {
        const next = await read(true);
        done += next.processed; saved += next.saved; skipped += next.skipped;
        if (!alive.current) break;
        setProgress({ done: Math.min(done, total), total });
        qc.setQueryData(key, next);
        if (!next.remaining || !next.processed) break;
      }
      if (alive.current && !silent) toast.success(`המיון הושלם: ${saved} סומנו, ${skipped} נשארו לבחירה ידנית`);
    } catch { if (alive.current && !silent) toast.error('המיון נעצר. התוצאות שנשמרו נשארו; אפשר להמשיך בלחיצה נוספת.'); }
    finally {
      if (alive.current) { setBusy(false); await Promise.all(['broker-gender-remaining','broker-contact-queue','admin-profiles'].map(k => qc.invalidateQueries({ queryKey: [k] }))); }
    }
  };
  // Silent background pass over the remaining verified cards; ambiguous names stay for manual choice.
  useEffect(() => {
    if (autoRan.current || busy || !gate.enabled || !status.data?.remaining) return;
    autoRan.current = true;
    void run(true);
  }, [gate.enabled, status.data?.remaining, busy]);
  if (!gate.enabled) return null;
  return <span className="inline-flex shrink-0 items-center gap-0">
    <Button size="icon" variant="ghost" className="h-8 w-7" aria-label="מיון מגדר למתווכים מאומתים" title="מיון מגדר למתווכים מאומתים בלבד; סימונים קיימים נשמרים" disabled={busy || status.isPending || status.isError || !status.data?.remaining} onClick={() => void run(false)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Venus className="h-4 w-4 text-gender-female" />}</Button>
    <span role="status" aria-live="polite" dir="ltr" className="text-xs tabular-nums text-muted-foreground" title="ממתינים למיון מגדר">{busy && progress ? `${progress.done}/${progress.total}` : status.isError ? '…' : status.data?.remaining ?? '…'}</span>
  </span>;
}