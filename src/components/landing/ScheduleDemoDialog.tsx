/**
 * Landing-page "Schedule a Demo" modal.
 * Collects first name, last name, phone and a preferred Zoom slot,
 * stores the request in the database and shows a success state.
 */
import * as React from 'react';
import { z } from 'zod';
import { CalendarCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { formatPhoneAsTyped, normalizePhoneForStorage, isValidIsraeliPhone } from '@/lib/formatPhone';

const schema = z.object({
  firstName: z.string().trim().min(2, 'נא למלא שם פרטי').max(60),
  lastName: z.string().trim().min(2, 'נא למלא שם משפחה').max(60),
  phone: z.string().refine(isValidIsraeliPhone, 'מספר טלפון לא תקין'),
  preferredAt: z.string().min(1, 'נא לבחור מועד לדמו'),
});

/** Local datetime-local value for "now + 1 hour", used as the minimum slot. */
function minSlot(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleDemoDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ firstName: '', lastName: '', phone: '', preferredAt: '' });

  const reset = () => {
    setForm({ firstName: '', lastName: '', phone: '', preferredAt: '' });
    setDone(false);
    setError(null);
    setSaving(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setTimeout(reset, 200);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'נא לבדוק את הפרטים');
      return;
    }
    setSaving(true);
    const { error: dbError } = await supabase.from('demo_requests').insert({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      phone: normalizePhoneForStorage(parsed.data.phone),
      preferred_at: new Date(parsed.data.preferredAt).toISOString(),
      source: 'landing',
    });
    setSaving(false);
    if (dbError) {
      setError('השליחה נכשלה, נסו שוב בעוד רגע');
      return;
    }
    setDone(true);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-md">
        {done ? (
          <div className="py-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CalendarCheck className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-xl font-extrabold">הבקשה נשלחה</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              נחזור אליכם בוואטסאפ לאישור מועד הדמו בזום. הדמו נמשך 15 דקות.
            </p>
            <Button className="mt-6 w-full" onClick={() => handleOpenChange(false)}>
              סגירה
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader className="text-right">
              <DialogTitle>תיאום דמו בזום</DialogTitle>
              <DialogDescription>
                השאירו פרטים ובחרו מועד נוח - דמו אישי של 15 דקות.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="mt-2 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="demo-first">שם פרטי</Label>
                  <Input
                    id="demo-first"
                    value={form.firstName}
                    maxLength={60}
                    autoComplete="given-name"
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="demo-last">שם משפחה</Label>
                  <Input
                    id="demo-last"
                    value={form.lastName}
                    maxLength={60}
                    autoComplete="family-name"
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="demo-phone">טלפון</Label>
                <Input
                  id="demo-phone"
                  inputMode="tel"
                  autoComplete="tel"
                  dir="ltr"
                  placeholder="050-0000000"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: formatPhoneAsTyped(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="demo-when">מועד מועדף לדמו בזום</Label>
                <Input
                  id="demo-when"
                  type="datetime-local"
                  dir="ltr"
                  min={minSlot()}
                  value={form.preferredAt}
                  onChange={(e) => setForm((f) => ({ ...f, preferredAt: e.target.value }))}
                />
              </div>
              {error && <p className="text-sm font-medium text-destructive">{error}</p>}
              <Button type="submit" size="lg" disabled={saving} className="w-full font-extrabold">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'שליחת הבקשה'}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ScheduleDemoDialog;
