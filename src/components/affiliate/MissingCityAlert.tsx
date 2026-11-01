import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/** Missing-city opt-in: Rita confirms through the official WhatsApp number with an approved template. */
export function MissingCityAlert({ preferences }: { preferences: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
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
    <div className="col-span-2 rounded-md border">
      <button type="button" onClick={() => setOpen(v => !v)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-[16px]">
        <span>העיר שלך לא מופיעה כאן?</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="space-y-2 px-3 pb-3 text-[15px]">
          {done ? <p className="text-muted-foreground">תודה! נעדכן אותך בוואטסאפ.</p> : <>
            <p className="text-muted-foreground">עדיין אין לנו נכסים במאגר בעיר שלך. לקבלת התראה כאשר יתווספו בהתאמה לחיפוש שלך הקלד את מספר הוואטסאפ שלך</p>
            <Input value={city} onChange={e => setCity(e.target.value)} placeholder="שם העיר" maxLength={80} className="text-[16px]" />
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="מספר וואטסאפ" inputMode="tel" dir={phone ? 'ltr' : 'rtl'} maxLength={20} className="text-[16px]" />
            <label className="flex items-start gap-2 text-[14px]">
              <Checkbox checked={consent} onCheckedChange={v => setConsent(v === true)} className="mt-0.5" />
              <span>אני מאשר/ת לקבל מריטה הודעות וואטסאפ על נכסים מתאימים</span>
            </label>
            <Button type="button" size="sm" disabled={busy || !consent || phone.replace(/\D/g, '').length < 9} onClick={submit}>{busy ? 'שולח...' : 'עדכנו אותי'}</Button>
          </>}
        </div>
      ) : null}
    </div>
  );
}
