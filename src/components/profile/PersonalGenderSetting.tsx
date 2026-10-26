import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { usePersonalLanguage, profileGender, personalGenderKey } from '@/i18n/personalLanguage';
import { toast } from '@/i18n/personalToast';
/** Personal preference remains editable even while inspecting another workspace. */
export function PersonalGenderSetting() {
  const { user } = useAuth();
  const { gender } = usePersonalLanguage();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const save = async (value: 'male' | 'female') => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from('profiles').update({ gender: value }).eq('id', user.id).select('gender').single();
      if (error) throw error;
      cache.setQueryData(personalGenderKey(user.id), profileGender(data.gender));
      window.dispatchEvent(new Event('toraff:gender-saved'));
    } catch { toast.error('שמירת ההעדפה נכשלה'); }
    finally { setBusy(false); }
  };
  return <div className="flex items-center justify-between gap-3 border-b border-border pb-3"><span className="text-sm font-medium">הפנייה האישית אליי</span><div role="group" aria-label="הפנייה האישית אליי" className="flex gap-2">{(['male', 'female'] as const).map(value => <Button key={value} size="sm" disabled={busy} variant={gender === value ? 'default' : 'outline'} aria-pressed={gender === value} onClick={() => void save(value)}>{value === 'male' ? 'גבר' : 'אישה'}</Button>)}</div></div>;
}