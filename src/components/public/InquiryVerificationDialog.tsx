import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type InquiryChallenge = {
  id: string;
  reason?: 'geo' | 'volume';
  questions: Array<{ id: string; label: string; options: string[] }>;
  otp?: boolean;
  phone_masked?: string | null;
};

export type InquiryVerification = { id: string; answers: Record<string, string>; otp_code?: string; resend?: boolean };

/** Stable anonymous device id used only by the inquiry anti-spam guard. */
export function inquiryDeviceId(): string {
  try {
    const key = 'rz_inquiry_device';
    let v = localStorage.getItem(key);
    if (!v) { v = crypto.randomUUID(); localStorage.setItem(key, v); }
    return v;
  } catch { return ''; }
}

export default function InquiryVerificationDialog({ challenge, sending, onSubmit, onClose }: {
  challenge: InquiryChallenge | null;
  sending?: boolean;
  onSubmit: (verification: InquiryVerification) => void;
  onClose: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [code, setCode] = useState('');
  const reset = () => { setAnswers({}); setCode(''); onClose(); };
  const questions = challenge?.questions ?? [];
  const otpOk = !challenge?.otp || /^\d{6}$/.test(code);
  const complete = !!challenge && questions.every((q) => answers[q.id]) && otpOk;
  const intro = challenge?.reason === 'volume'
    ? 'זיהינו מספר פניות גבוה מהרגיל. כדי להמשיך, יש לאמת את מספר הטלפון.'
    : 'זיהינו פניות לנכסים באזורים רחוקים זה מזה בזמן קצר. כמה שאלות קצרות ואימות טלפון כדי לוודא שמדובר בפנייה אמיתית.';
  return (
    <Dialog open={!!challenge} onOpenChange={(o) => { if (!o) reset(); }}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader><DialogTitle className="text-right">אימות קצר לפני שליחה</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{intro}</p>
        <div className="space-y-4">
          {questions.map((q) => (
            <div key={q.id} className="space-y-2">
              <p className="text-sm font-medium text-foreground">{q.label}</p>
              <div className="flex flex-wrap gap-2">
                {q.options.map((o) => (
                  <button key={o} type="button" onClick={() => setAnswers((a) => ({ ...a, [q.id]: o }))}
                    className={`rounded-full border px-3 py-1 text-xs ${answers[q.id] === o ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-foreground'}`}>{o}</button>
                ))}
              </div>
            </div>
          ))}
          {challenge?.otp && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                קוד אימות שנשלח ב-SMS{challenge.phone_masked ? <> למספר <span dir="ltr">{challenge.phone_masked}</span></> : null}
              </p>
              <div className="flex items-center gap-2">
                <Input dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000"
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="text-center tracking-widest" />
                <Button type="button" variant="ghost" size="sm" disabled={sending}
                  onClick={() => challenge && onSubmit({ id: challenge.id, answers, resend: true })}>שליחה חוזרת</Button>
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <Button variant="outline" onClick={reset}>ביטול</Button>
          <Button disabled={!complete || sending} onClick={() => challenge && onSubmit({ id: challenge.id, answers, otp_code: code || undefined })}>אישור ושליחה</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
