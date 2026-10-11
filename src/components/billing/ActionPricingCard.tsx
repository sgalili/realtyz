import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ACTION_META, CREDITS_PER_ILS, agorotToCredits, fmtCredits } from '@/lib/credits';

type Row = { action_key: string; label_he: string; unit_he: string; price_agorot: number };

export function ActionPricingCard() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ['action-pricing'],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)('action_pricing').select('action_key,label_he,unit_he,price_agorot').order('sort_order');
      if (error) throw error;
      return data as Row[];
    },
  });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(Object.fromEntries(data.map((r) => [r.action_key, String(r.price_agorot)]))), [data]);

  const save = async () => {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    for (const r of data) {
      const v = Number(draft[r.action_key]);
      if (!Number.isFinite(v) || v < 0) { toast.error(`מחיר לא תקין: ${r.label_he}`); setSaving(false); return; }
      if (v === Number(r.price_agorot)) continue;
      const { error } = await (supabase.from as any)('action_pricing')
        .update({ price_agorot: v, updated_at: new Date().toISOString(), updated_by: u.user?.id }).eq('action_key', r.action_key);
      if (error) { toast.error('השמירה נכשלה'); setSaving(false); return; }
    }
    setSaving(false);
    toast.success('המחירון נשמר');
    qc.invalidateQueries({ queryKey: ['action-pricing'] });
  };

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle>מחירון פעולות</CardTitle>
        <CardDescription>₪1 = {CREDITS_PER_ILS} קרדיטים · קרדיט אחד = 4 אגורות</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.map((r) => {
          const Meta = ACTION_META[r.action_key];
          const Icon = Meta?.icon;
          const v = Number(draft[r.action_key] ?? 0);
          return (
            <div key={r.action_key} className="flex items-center gap-3">
              {Icon && <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${Meta.tone}`}><Icon className="h-4 w-4" /></span>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.label_he}</p>
                <p className="text-xs text-muted-foreground">ל{r.unit_he} · {fmtCredits(agorotToCredits(v || 0))}</p>
              </div>
              <div className="flex items-center gap-1">
                <Input dir="ltr" type="number" min={0} step="0.1" className="w-24" value={draft[r.action_key] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [r.action_key]: e.target.value }))} />
                <span className="text-xs text-muted-foreground">אג׳</span>
              </div>
            </div>
          );
        })}
        <Button onClick={save} disabled={saving} className="w-full">{saving ? 'שומר...' : 'שמירת מחירון'}</Button>
      </CardContent>
    </Card>
  );
}
