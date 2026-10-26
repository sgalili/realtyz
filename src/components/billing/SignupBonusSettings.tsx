import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SignupBonusSettings() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['signup-bonus-settings'], queryFn: async () => {
    const { data, error } = await supabase.rpc('get_signup_bonus_settings');
    if (error) throw error; return Number(data);
  } });
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (query.data !== undefined) setValue(String(query.data)); }, [query.data]);
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('set_signup_bonus_settings', { _credits: Number(value) });
    setSaving(false);
    if (error) { toast.error('לא ניתן לשמור את בונוס ההרשמה'); return; }
    toast.success('בונוס ההרשמה נשמר'); void qc.invalidateQueries({ queryKey: ['signup-bonus-settings'] });
  };
  return <section className="space-y-3 border-b py-4" dir="rtl">
    <h2 className="flex items-center gap-2 font-semibold"><Gift className="h-5 w-5 text-success" />בונוס הרשמה</h2>
    <div className="flex items-end justify-between gap-3">
      <div className="space-y-1"><Label htmlFor="signup-bonus-credits">קרדיטים חינם למשתמש חדש</Label>
        <Input id="signup-bonus-credits" type="number" dir="ltr" min={0} max={1000000} step="0.01" value={value} onChange={event => setValue(event.target.value)} className="w-36" /></div>
      <Button onClick={() => void save()} disabled={query.isError || query.isLoading || saving || !value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1000000}>שמירה</Button>
    </div>
    {query.isError && <p role="alert" className="text-sm text-destructive">לא ניתן לטעון את ההגדרה כרגע</p>}
  </section>;
}