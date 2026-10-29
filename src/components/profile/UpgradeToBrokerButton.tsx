import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { BadgeCheck, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BrokerLicenseField } from '@/components/auth/BrokerLicenseField';
import { BrokerCertificateCheck } from '@/components/auth/BrokerCertificateCheck';
import { BROKER_COURSE_URL, BROKER_EXAM_REGISTRATION_URL } from '@/components/affiliate/BrokerClosingInfo';
import { verifyBrokerLicense } from '@/lib/brokerLicense';
import { toast } from '@/i18n/personalToast';

const FAILURES: Record<string, string> = {
  registry_verification_required: 'יש לאמת את מספר הרישיון מול פנקס המתווכים.',
  certificate_match_required: 'יש להעלות את תעודת הרישיון המקורית ולוודא שהיא תואמת למספר הרישיון.',
  invalid_official_license: 'מספר הרישיון אינו מופיע בפנקס המתווכים המורשים.',
};

/** Non-broker upgrade request: registry + certificate match, then manual Super Admin approval. */
export function UpgradeToBrokerButton() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [license, setLicense] = useState('');
  const [verified, setVerified] = useState<string | null>(null);
  const [certificateLicense, setCertificateLicense] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { user } = useAuth();
  const { data: account } = useQuery({ queryKey: ['broker-upgrade-request', user?.id, 'profile-status'], enabled: !!user?.id, queryFn: async () => {
    if (!user?.id) return null;
    const [verification, profile, request, affiliate] = await Promise.all([
      supabase.rpc('partner_can_view_closing', { _user_id: user.id }),
      supabase.from('profiles').select('broker_license_number').eq('id', user.id).maybeSingle(),
      supabase.from('broker_upgrade_requests').select('id, license_number').eq('user_id', user.id).eq('status', 'pending').maybeSingle(),
      supabase.from('affiliate_profiles').select('license_number, license_status').eq('user_id', user.id).maybeSingle(),
    ]);
    for (const result of [verification, profile, request, affiliate]) if (result.error) throw result.error;
    return {
      verified: verification.data === true,
      pending: !!request.data,
      license: request.data?.license_number || profile.data?.broker_license_number || affiliate.data?.license_number || '',
      rejected: affiliate.data?.license_status === 'rejected',
    };
  } });
  useEffect(() => {
    if (!open) setLicense(account?.license ?? '');
  }, [account?.license, open]);
  const pending = account?.pending === true;
  const onCertificate = useCallback((r: { matched: boolean; licenseNumber?: string } | null) => setCertificateLicense(r?.matched ? r.licenseNumber ?? null : null), []);
  const ready = !!verified && verified === license && certificateLicense === license;

  const submit = async () => {
    if (!ready || busy || pending) return;
    setBusy(true);
    try {
      await verifyBrokerLicense(license, 'verify');
      const { error } = await supabase.rpc('submit_broker_upgrade_request' as any);
      if (error) throw new Error(Object.entries(FAILURES).find(([k]) => error.message.includes(k))?.[1] ?? 'השדרוג לא הושלם. נסו שוב.');
      await queryClient.invalidateQueries({ queryKey: ['broker-upgrade-request'] });
      setSubmitted(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'השדרוג לא הושלם.');
    } finally { setBusy(false); }
  };

  if (account?.verified) return null;
  return <>
    <section aria-label="שדרוג וסטטוס רישיון תיווך" className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3" dir="rtl">
      {account?.license && <div className="flex flex-wrap items-center justify-between gap-2 text-base">
        <span>מספר רישיון תיווך: <b dir="ltr">{account.license}</b></span>
        <span role="status" className="text-sm text-muted-foreground">{pending ? 'ממתינה לאישור מנהל' : account.rejected ? 'הרישיון נדחה — ניתן להגיש מחדש' : 'הרישיון הוזן — השדרוג טרם אושר'}</span>
      </div>}
    <Button type="button" size="lg" className="w-full gap-2 text-base" onClick={() => setOpen(true)}>
      <BadgeCheck className="h-5 w-5" aria-hidden />שדרג למתווך מורשה
    </Button>
    </section>
    <Dialog open={open} onOpenChange={(o) => { if (busy) return; setOpen(o); if (!o && submitted) void queryClient.invalidateQueries({ queryKey: ['broker-upgrade-request'] }); }}>
      <DialogContent dir="rtl" className="max-h-[90vh] max-w-md overflow-y-auto text-right">
        <DialogHeader className="text-right">
          <DialogTitle className="text-right text-xl">שדרוג למתווך מורשה</DialogTitle>
          <DialogDescription className="text-right text-base leading-relaxed">
            מתווך מורשה מקבל גישה לעמלות סגירה ולכלי התיווך. כך מקבלים רישיון:
          </DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-1 ps-5 text-base text-foreground">
          <li>לומדים לקראת מבחן התיווך בקורס מקוון.</li>
          <li>נרשמים למבחן הלאומי של רשם המתווכים ועוברים אותו.</li>
          <li>מקבלים רישיון ומזינים כאן את מספרו ואת צילום התעודה.</li>
        </ol>
        <div className="flex items-center justify-between gap-2">
          <Button asChild variant="outline" className="flex-1"><a href={BROKER_COURSE_URL} target="_blank" rel="noopener noreferrer">לקורס</a></Button>
          <Button asChild variant="outline" className="flex-1"><a href={BROKER_EXAM_REGISTRATION_URL} target="_blank" rel="noopener noreferrer">להרשמה למבחן הלאומי</a></Button>
        </div>
        {pending ? <div role="status" className="space-y-2 border-t border-border pt-3 text-base">
          <p>מספר רישיון תיווך: <b dir="ltr">{account?.license}</b></p>
          <p>הבקשה והמסמכים נשלחו לבדיקה וממתינים לאישור מנהל. הרשאות התיווך יינתנו רק לאחר האישור.</p>
        </div> : <div className="space-y-2 border-t border-border pt-3">
          <p className="text-base font-semibold">כבר קיבלת רישיון?</p>
          <BrokerLicenseField bare value={license} onChange={setLicense} onVerified={setVerified} />
          {verified === license && !!license && <BrokerCertificateCheck onResult={onCertificate} />}
          {certificateLicense && certificateLicense !== license && <p role="alert" className="text-sm text-destructive">מספר הרישיון בתעודה שונה מהמספר שהוזן.</p>}
        </div>}
        {submitted ? <div role="status" className="space-y-1 rounded-md border border-success bg-success/10 p-3 text-base">
          <p className="font-semibold text-success">הבקשה נשלחה בהצלחה</p>
          <p>הבקשה ממתינה לאישור מנהל. נעדכן אותך כשהחשבון ישודרג למתווך מורשה.</p>
        </div> : !pending && <Button type="button" size="lg" className="w-full text-base" disabled={!ready || busy} onClick={() => void submit()}>
          {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}שליחת הבקשה לאישור
        </Button>}
      </DialogContent>
    </Dialog>
  </>;
}
