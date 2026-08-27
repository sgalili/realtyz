/**
 * TourSchedulerDialog
 * -------------------
 * Public "תאם סיור" booking modal used on the shared property landing page.
 * Enforces office business hours inline (Sun-Thu 09:00-18:00, Fri 09:00-13:00,
 * Sat closed) before calling the `book-property-tour` edge function.
 */
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CalendarClock, CheckCircle2, Loader2 } from 'lucide-react';
import { BUSINESS_HOURS_HE, slotsForDate, validateTourSlot } from '@/lib/tourBusinessHours';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  propertyTitle?: string | null;
};

export default function TourSchedulerDialog({ open, onOpenChange, token, propertyTitle }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const slots = useMemo(() => slotsForDate(date), [date]);
  const slotError = date || time ? validateTourSlot(date, time) : null;

  const nameError = name.trim().length > 0 && name.trim().length < 2 ? 'יש להזין שם מלא' : null;
  const phoneDigits = phone.replace(/\D/g, '');
  const phoneError =
    phone.length > 0 && !/^(0\d{9}|972\d{9})$/.test(phoneDigits) ? 'מספר טלפון לא תקין (למשל 052-1234567)' : null;

  const canSubmit =
    !submitting && name.trim().length >= 2 && !phoneError && phone.length > 0 && !!date && !!time && !slotError;

  const submit = async () => {
    const err = validateTourSlot(date, time);
    if (err) return setServerError(err);
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/book-property-tour`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          client_name: name.trim(),
          client_phone: phone.trim(),
          client_email: email.trim() || undefined,
          date,
          time,
          notes: notes.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || body?.ok !== true) throw new Error(body?.error || 'תיאום הסיור נכשל, נסו שוב');
      setDone(true);
    } catch (e: any) {
      setServerError(e?.message ?? 'תיאום הסיור נכשל, נסו שוב');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setDone(false); setServerError(null); } }}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-right">
            <CalendarClock className="h-5 w-5 text-primary" />
            תאם סיור בנכס
          </DialogTitle>
          <DialogDescription className="text-right">
            {propertyTitle ? `${propertyTitle} · ` : ''}שעות פעילות: {BUSINESS_HOURS_HE.join(' · ')}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-3 py-4 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <p className="text-[16px] font-semibold text-slate-900">הסיור נקבע בהצלחה</p>
            <p className="text-[14px] text-muted-foreground">
              אישור נשלח אליך בוואטסאפ למספר שהזנת. נתראה בסיור.
            </p>
            <Button className="w-full" onClick={() => onOpenChange(false)}>סגירה</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tour-name">שם מלא</Label>
              <Input id="tour-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
              {nameError && <p className="text-[12px] text-destructive">{nameError}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tour-phone">טלפון (וואטסאפ)</Label>
              <Input id="tour-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={20} />
              {phoneError && <p className="text-[12px] text-destructive">{phoneError}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tour-email">אימייל</Label>
              <Input id="tour-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tour-date">תאריך</Label>
                <Input
                  id="tour-date"
                  type="date"
                  min={todayISO}
                  value={date}
                  onChange={(e) => { setDate(e.target.value); setTime(''); }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tour-time">שעה</Label>
                <select
                  id="tour-time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  disabled={!date || slots.length === 0}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-[14px] disabled:opacity-50"
                >
                  <option value="">בחר שעה</option>
                  {slots.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {slotError && <p className="text-[12px] font-medium text-destructive">{slotError}</p>}

            <div className="space-y-1.5">
              <Label htmlFor="tour-notes">הערות</Label>
              <Textarea id="tour-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={2} />
            </div>

            {serverError && <p className="text-[13px] font-medium text-destructive">{serverError}</p>}

            <Button className="w-full" disabled={!canSubmit} onClick={submit}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'אישור תיאום הסיור'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
