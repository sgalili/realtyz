import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type InquiryChallenge = { id: string; questions: Array<{ id: string; label: string; options: string[] }> };

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
  onSubmit: (verification: { id: string; answers: Record<string, string> }) => void;
  onClose: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const complete = !!challenge && challenge.questions.every((q) => answers[q.id]);
  return (
    <Dialog open={!!challenge} onOpenChange={(o) => { if (!o) { setAnswers({}); onClose(); } }}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader><DialogTitle className="text-right">אימות קצר לפני שליחה</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">זיהינו פניות לנכסים באזורים שונים בזמן קצר. כמה שאלות קצרות כדי לוודא שמדובר בפנייה אמיתית.</p>
        <div className="space-y-4">
          {challenge?.questions.map((q) => (
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
        </div>
        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <Button variant="outline" onClick={() => { setAnswers({}); onClose(); }}>ביטול</Button>
          <Button disabled={!complete || sending} onClick={() => challenge && onSubmit({ id: challenge.id, answers })}>אישור ושליחה</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
