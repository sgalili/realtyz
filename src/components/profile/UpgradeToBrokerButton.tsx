import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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

/** Non-broker upgrade: registry match + certificate match, then a server-side role grant. */
export function UpgradeToBrokerButton({ onUpgraded }: { onUpgraded?: (license: string) => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [license, setLicense] = useState('');
  const [verified, setVerified] = useState<string | null>(null);
  const [certificateLicense, setCertificateLicense] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onCertificate = useCallback((r: { matched: boolean; licenseNumber?: string } | null) => setCertificateLicense(r?.matched ? r.licenseNumber ?? null : null), []);
  const ready = !!verified && verified === license && certificateLicense === license;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      await verifyBrokerLicense(license, 'verify');
      const { error } = await supabase.rpc('upgrade_to_verified_broker' as any);
      if (error) throw new Error(Object.entries(FAILURES).find(([k]) => error.message.includes(k))?.[1] ?? 'השדרוג לא הושלם. נסו שוב.');
      await queryClient.invalidateQueries();
      window.dispatchEvent(new Event('realtyz:profile-saved'));
      toast.success('החשבון שודרג למתווך מורשה מאומת.');
      onUpgraded?.(license);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'השדרוג לא הושלם.');
    } finally { setBusy(false); }
  };

  return <>
    <Button type="button" size="lg" className="w-full gap-2 text-base" onClick={() => setOpen(true)}>
      <BadgeCheck className="h-5 w-5" aria-hidden />שדרג למתווך מורשה
    </Button>
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
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
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-base font-semibold">כבר קיבלת רישיון?</p>
          <BrokerLicenseField bare value={license} onChange={setLicense} onVerified={setVerified} />
          {verified === license && !!license && <BrokerCertificateCheck onResult={onCertificate} />}
          {certificateLicense && certificateLicense !== license && <p role="alert" className="text-sm text-destructive">מספר הרישיון בתעודה שונה מהמספר שהוזן.</p>}
        </div>
        <Button type="button" size="lg" className="w-full text-base" disabled={!ready || busy} onClick={() => void submit()}>
          {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}אימות ושדרוג החשבון
        </Button>
      </DialogContent>
    </Dialog>
  </>;
}
