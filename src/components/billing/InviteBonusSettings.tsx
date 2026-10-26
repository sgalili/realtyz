import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useInviteBonusSettings } from '@/hooks/useInviteBonusSettings';

const valid = (v: string) => v.trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 1000000;

export function InviteBonusSettings() {
  const qc = useQueryClient();
  const query = useInviteBonusSettings();
  const [ref, setRef] = useState('');
  const [friend, setFriend] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (query.data) { setRef(String(query.data.referrer_credits)); setFriend(String(query.data.friend_credits)); } }, [query.data]);
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('set_invite_bonus_settings', { _referrer: Number(ref), _friend: Number(friend) });
    setSaving(false);
    if (error) { toast.error('לא ניתן לשמור את בונוס ההזמנה'); return; }
    toast.success('בונוס ההזמנה נשמר'); void qc.invalidateQueries({ queryKey: ['invite-bonus-settings'] });
  };
  return <section className="space-y-3 border-b py-4" dir="rtl">
    <h2 className="flex items-center gap-2 font-semibold"><Users className="h-5 w-5 text-deal-blue" />בונוס הזמנת חברים</h2>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1"><Label htmlFor="invite-ref-credits">קרדיטים למזמין</Label>
        <Input id="invite-ref-credits" type="number" dir="ltr" min={0} max={1000000} value={ref} onChange={e => setRef(e.target.value)} className="w-32" /></div>
      <div className="space-y-1"><Label htmlFor="invite-friend-credits">קרדיטים לחבר המוזמן</Label>
        <Input id="invite-friend-credits" type="number" dir="ltr" min={0} max={1000000} value={friend} onChange={e => setFriend(e.target.value)} className="w-32" /></div>
      <Button onClick={() => void save()} disabled={query.isError || query.isLoading || saving || !valid(ref) || !valid(friend)}>שמירה</Button>
    </div>
    {query.isError && <p role="alert" className="text-sm text-destructive">לא ניתן לטעון את ההגדרה כרגע</p>}
  </section>;
}
