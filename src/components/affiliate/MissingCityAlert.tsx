import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { WhatsAppIcon } from '@/components/properties/WhatsAppIcon';

/**
 * Missing-city opt-in body. It renders inside the cities list, below the
 * "העיר שלך לא מופיעה כאן?" row, and Rita confirms through the official
 * WhatsApp number with an approved template.
 */
export function MissingCityAlert({ preferences }: { preferences: Record<string, unknown> }) {
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('city-alert-request', { body: { phone, city: city || undefined, preferences, consent: true } });
    setBusy(false);
    if (error || !data?.ok) { toast.error('לא הצלחנו לשמור את הבקשה. בדקו את המספר ונסו שוב'); return; }
    setDone(true);
    toast.success(data.sent ? 'ריטה שלחה לך אישור בוואטסאפ' : 'נשמר! נעדכן אותך בוואטסאפ כשיתווספו נכסים');
  };

  return (
    <div className="space-y-2 px-2 pb-2 pt-1 text-[15px]">
      {done ? <p className="text-muted-foreground">תודה! נעדכן אותך בוואטסאפ.</p> : <>
        <p className="text-muted-foreground">עדיין אין לנו נכסים במאגר בעיר שלך. לקבלת התראה כאשר יתווספו בהתאמה לחיפוש שלך הקלד את מספר הוואטסאפ שלך</p>
        <Input value={city} onChange={e => setCity(e.target.value)} placeholder="שם העיר" maxLength={80} className="text-[16px]" />
        <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="מספר וואטסאפ" inputMode="tel" dir={phone ? 'ltr' : 'rtl'} maxLength={20} className="text-[16px]" />
        <label className="flex items-start gap-2 text-[14px]">
          <Checkbox checked={consent} onCheckedChange={v => setConsent(v === true)} className="mt-0.5" />
          <span>אני מאשר/ת לקבל מריטה הודעות וואטסאפ על נכסים מתאימים</span>
        </label>
        <Button
          type="button"
          size="sm"
          disabled={busy || !consent || phone.replace(/\D/g, '').length < 9}
          onClick={submit}
          className="w-full gap-2 bg-social-whatsapp text-[15px] font-semibold text-social-foreground hover:bg-social-whatsapp/90"
        >
          <WhatsAppIcon className="h-4 w-4" />
          {busy ? 'שולח...' : 'עדכן אותי'}
        </Button>
      </>}
    </div>
  );
}

export default MissingCityAlert;
