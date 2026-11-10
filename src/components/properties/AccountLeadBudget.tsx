import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { parseDailyLimit } from '@/lib/publicationSettings';
import { toast } from 'sonner';

/** The billing account owns this limit, independently of the selected property. */
export function AccountLeadBudget({ ownerId }: { ownerId: string | null }) {
  const [count, setCount] = useState('');
  const [spend, setSpend] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const scope = useRef(ownerId); scope.current = ownerId;
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setReadFailed(false); setBusy(false); setCount(''); setSpend('');
    if (!ownerId) { setLoading(false); setReadFailed(true); return; }
    void supabase.from('account_lead_limits' as never).select('daily_count,daily_spend_ils').eq('user_id', ownerId).maybeSingle().then(({ data, error }) => {
      if (cancelled) return;
      if (error) { setLoading(false); setReadFailed(true); toast.error('לא ניתן לטעון את מגבלת החשבון'); return; }
      const row = data as { daily_count?: number | null; daily_spend_ils?: number | null } | null;
      setCount(row?.daily_count == null ? '' : String(row.daily_count));
      setSpend(row?.daily_spend_ils == null ? '' : String(row.daily_spend_ils));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [ownerId, reload]);
  const save = async () => {
    if (!ownerId || busy || loading || readFailed) return;
    const target = ownerId;
    try {
      const dailyCount = parseDailyLimit(count);
      const dailySpend = spend.trim() ? Number(spend) : null;
      if (dailySpend !== null && (!Number.isFinite(dailySpend) || dailySpend <= 0)) throw new Error('תקרת ההוצאה חייבת להיות סכום חיובי');
      setBusy(true);
      const { data, error } = await supabase.from('account_lead_limits' as never).upsert({ user_id: target, daily_count: dailyCount, daily_spend_ils: dailySpend } as never).select('daily_count,daily_spend_ils').single();
      if (error) throw error;
      if (scope.current !== target) return;
      const row = data as { daily_count: number | null; daily_spend_ils: number | null };
      setCount(row.daily_count == null ? '' : String(row.daily_count)); setSpend(row.daily_spend_ils == null ? '' : String(row.daily_spend_ils));
      toast.success('מגבלות החשבון נשמרו');
    } catch (error) { if (scope.current === target) toast.error(error instanceof Error ? error.message : 'לא ניתן לשמור את מגבלות החשבון'); }
    finally { if (scope.current === target) setBusy(false); }
  };
  return <section className="space-y-2 border-t border-border pt-3 text-sm">
    <h3 className="font-semibold">מגבלה כוללת לחשבון · 24 שעות</h3>
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1"><span className="block">מקסימום פניות בתשלום</span><Input className="h-8 w-28" aria-label="מקסימום פניות יומי לחשבון" inputMode="numeric" type="number" min={1} value={count} placeholder={readFailed ? 'לא זמין' : 'ללא הגבלה'} disabled={loading || busy || readFailed} onChange={event => setCount(event.target.value)} /></label>
      <label className="space-y-1"><span className="block">מקסימום הוצאה (₪)</span><Input className="h-8 w-28" aria-label="מקסימום הוצאה יומית לחשבון" inputMode="decimal" type="number" min={0.01} step={0.01} value={spend} placeholder={readFailed ? 'לא זמין' : 'ללא הגבלה'} disabled={loading || busy || readFailed} onChange={event => setSpend(event.target.value)} /></label>
      <Button type="button" variant="outline" size="sm" disabled={loading || busy || readFailed} onClick={() => void save()}>{busy ? 'שומר…' : 'שמירת מגבלות'}</Button>
      {readFailed && <Button type="button" variant="outline" size="sm" onClick={() => setReload(value => value + 1)}>ניסיון טעינה נוסף</Button>}
    </div><p className="text-xs leading-relaxed text-muted-foreground">חלה על כל הנכסים והחיובים עבור פניות בחשבון זה, כולל רכישות פניות נוספות ותוספות סינון. שמירת המגבלה אינה מפרסמת את הנכס. ללא חיוב על צפיות או שיתופים.</p>
  </section>;
}