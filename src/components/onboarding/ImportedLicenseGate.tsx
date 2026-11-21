import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { ShieldCheck, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { brokerLicenseDigits, verifyBrokerLicense } from '@/lib/brokerLicense';
import { importedLicenseDaysLabel, type ImportedLicenseState } from '@/lib/importedLicenseState';

const OPEN_PATHS = ['/auth', '/terms', '/privacy', '/accessibility'];

/** Pre-created (silent) broker accounts: explain, verify the license, show the grace countdown and block after expiry. */
export function ImportedLicenseGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const qc = useQueryClient();
  const key = ['imported-license-state', user?.id];
  const { data: state } = useQuery({
    queryKey: key, enabled: !!user, staleTime: 60_000,
    queryFn: async () => { const { data, error } = await supabase.rpc('imported_broker_license_state'); if (error) throw error; return (data ?? null) as ImportedLicenseState | null; },
  });
  const dismissKey = `toraff-imported-license-dismissed:${user?.id}`;
  const [open, setOpen] = React.useState(false);
  const [license, setLicense] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  React.useEffect(() => { setLicense(state?.license_number ?? ''); setMessage(null); }, [state?.license_number, user?.id]);
  React.useEffect(() => {
    if (state && state.status === 'unverified' && !sessionStorage.getItem(dismissKey)) setOpen(true);
  }, [state?.status, dismissKey]);
  if (!user || !state || state.status === 'verified') return <>{children}</>;

  const submit = async () => {
    setBusy(true); setMessage(null);
    try {
      await verifyBrokerLicense(license, 'verify');
      setMessage('הרישיון אומת מול רשם המתווכים. תודה!');
    } catch {
      const { error } = await supabase.rpc('request_imported_license_review', { _license: brokerLicenseDigits(license) });
      setMessage(error
        ? (error.message.includes('another_account') ? 'מספר הרישיון כבר משויך לחשבון אחר. צרו איתנו קשר.' : 'מספר הרישיון אינו תקין. בדקו ונסו שוב.')
        : 'לא הצלחנו לאמת את הרישיון מול המאגר הממשלתי. העברנו את הבקשה לבדיקה ידנית של צוות TORAFF.');
    } finally { setBusy(false); await qc.invalidateQueries({ queryKey: key }); }
  };

  const form = (
    <div className="space-y-3">
      <label className="block text-sm font-medium">מספר רישיון תיווך</label>
      <Input dir="ltr" inputMode="numeric" value={license} onChange={e => setLicense(brokerLicenseDigits(e.target.value))} placeholder="לדוגמה 3123456" />
      {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
      <Button className="w-full" disabled={busy || license.length < 4} onClick={submit}>{busy ? 'בודקים…' : 'אימות הרישיון'}</Button>
    </div>
  );
  const countdown = state.status !== 'blocked' && (
    <p className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm"><Clock className="h-4 w-4 shrink-0" />{importedLicenseDaysLabel(state.days_left ?? 0)}{state.review_pending ? ' · הבקשה נמצאת בבדיקה ידנית' : ''}</p>
  );

  if (state.status === 'blocked' && !OPEN_PATHS.some(p => location.pathname.startsWith(p))) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 text-right">
          <h1 className="text-xl font-bold">הגישה לחשבון מושהית</h1>
          <p className="text-muted-foreground">תקופת ההשלמה של אימות רישיון התיווך הסתיימה. הנכסים והטיוטות שלכם שמורים. אמתו את מספר הרישיון כדי לחזור לחשבון{state.review_pending ? ', או המתינו לסיום הבדיקה הידנית של צוות TORAFF' : ''}.</p>
          {form}
          <Button variant="ghost" className="w-full" onClick={() => supabase.auth.signOut()}>יציאה</Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      <button type="button" onClick={() => setOpen(true)} className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-sm shadow-md" dir="rtl">
        <ShieldCheck className="h-4 w-4" />{state.review_pending ? 'רישיון בבדיקה' : 'השלמת אימות רישיון'} · {state.days_left ?? 0} ימים
      </button>
      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) sessionStorage.setItem(dismissKey, '1'); }}>
        <DialogContent dir="rtl" className="text-right">
          <DialogHeader>
            <DialogTitle className="text-right">ברוכים הבאים ל־TORAFF</DialogTitle>
            <DialogDescription className="text-right leading-relaxed">
              חסכנו לכם עבודה: הקמנו עבורכם מראש חשבון עם הפרטים והנכסים שלכם כטיוטות. שום דבר לא פורסם בלי אישורכם.
              כדי להמשיך להשתמש בחשבון, נשאר רק לאמת את מספר רישיון התיווך שלכם.
            </DialogDescription>
          </DialogHeader>
          {countdown}
          {form}
        </DialogContent>
      </Dialog>
    </>
  );
}
