import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { BadgeCheck, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BrokerLicenseField } from '@/components/auth/BrokerLicenseField';
import { Input } from '@/components/ui/input';
import { CERTIFICATE_MAX_BYTES, CERTIFICATE_MIME_TYPES } from '../../../supabase/functions/_shared/brokerCertificate';
import { BROKER_COURSE_URL, BROKER_EXAM_REGISTRATION_URL } from '@/components/affiliate/BrokerClosingInfo';
import { verifyBrokerLicense } from '@/lib/brokerLicense';
import { toast } from '@/i18n/personalToast';
import { WhatsAppOtpVerify } from '@/components/auth/WhatsAppOtpVerify';

const FAILURES: Record<string, string> = {
  registry_verification_required: 'יש לאמת את מספר הרישיון מול פנקס המתווכים.',
  certificate_match_required: 'יש להעלות את תעודת הרישיון המקורית ולוודא שהיא תואמת למספר הרישיון.',
  invalid_official_license: 'מספר הרישיון אינו מופיע בפנקס המתווכים המורשים.',
};

/** Non-broker upgrade request: registry + certificate match, then manual Super Admin approval. */
export function UpgradeToBrokerButton({ profileOwnerId, publisher = false, onApproved }: { profileOwnerId?: string; publisher?: boolean; onApproved?: () => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(publisher);
  const [license, setLicense] = useState('');
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const subjectId = profileOwnerId ?? user?.id;
  const isOwnProfile = subjectId === user?.id;
  const sms = useQuery({ queryKey: ['publisher-sms', user?.id], enabled: open && !!user?.id, queryFn: async () => {
    const { data, error } = await supabase.rpc('publisher_sms_verified');
    if (error) throw error;
    return data === true;
  } });
  const { data: account } = useQuery({ queryKey: ['broker-upgrade-request', user?.id, subjectId, 'profile-status'], enabled: !!user?.id && !!subjectId, queryFn: async () => {
    if (!user?.id || !subjectId) return null;
    const [verification, profile, request, affiliate] = await Promise.all([
      supabase.rpc('partner_can_view_closing', { _user_id: subjectId }),
      supabase.from('profiles').select('broker_license_number').eq('id', subjectId).maybeSingle(),
      isOwnProfile ? supabase.from('broker_upgrade_requests').select('id, license_number').eq('user_id', subjectId).eq('status', 'pending').maybeSingle() : Promise.resolve({ data: null, error: null }),
      isOwnProfile ? supabase.from('affiliate_profiles').select('license_number, license_status').eq('user_id', subjectId).maybeSingle() : Promise.resolve({ data: null, error: null }),
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
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<'approved' | 'pending' | null>(null);
  const ready = !!license && !!file && sms.data === true;

  const submit = async () => {
    if (!isOwnProfile || !ready || busy || pending || !file) return;
    setBusy(true);
    try {
      await verifyBrokerLicense(license, 'verify');
      const body = new FormData(); body.set('certificate', file);
      const { data: cert, error: certError } = await supabase.functions.invoke('check-broker-certificate', { body });
      if (certError || !cert?.matched || cert.licenseNumber !== license) throw new Error('לא ניתן לאמת את הרישיון. בדקו את המספר ואת התמונה ונסו שוב.');
      const { data, error } = await supabase.rpc('submit_broker_upgrade_request' as any);
      if (error) throw new Error(Object.entries(FAILURES).find(([k]) => error.message.includes(k))?.[1] ?? 'השדרוג לא הושלם. נסו שוב.');
      const status = (data as { status?: string } | null)?.status === 'approved' ? 'approved' : 'pending';
      setResult(status);
      await queryClient.invalidateQueries({ queryKey: ['broker-upgrade-request'] });
      if (status === 'approved') await queryClient.invalidateQueries();
      if (status === 'approved') onApproved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'השדרוג לא הושלם.');
    } finally { setBusy(false); }
  };
  const continueVerified = async () => {
    if (sms.data !== true || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc('register_as_broker');
    setBusy(false);
    if (error) { toast.error('לא ניתן להשלים את אימות המתווך כרגע.'); return; }
    onApproved?.();
  };

  if (account?.verified && !publisher) return null;
  return <>
    {!publisher && <section aria-label="שדרוג וסטטוס רישיון תיווך" className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3" dir="rtl">
      {account?.license && <div className="flex flex-wrap items-center justify-between gap-2 text-base">
        <span>מספר רישיון תיווך: <b dir="ltr">{account.license}</b></span>
        <span role="status" className="text-sm text-muted-foreground">{pending ? 'בבדיקה' : account.rejected ? 'הרישיון נדחה — ניתן להגיש מחדש' : 'הרישיון הוזן — השדרוג טרם אושר'}</span>
      </div>}
    <Button type="button" size="lg" className="w-full gap-2 text-base" onClick={() => setOpen(true)}>
      <BadgeCheck className="h-5 w-5" aria-hidden />שדרג למתווך מורשה
    </Button>
    </section>}
    <Dialog open={open} onOpenChange={(o) => { if (busy) return; setOpen(o); if (!o && result) void queryClient.invalidateQueries({ queryKey: ['broker-upgrade-request'] }); }}>
      <DialogContent dir="rtl" className="max-h-[90vh] max-w-md overflow-y-auto text-right">
        <DialogHeader className="text-right">
          <DialogTitle className="text-right text-xl">שדרוג למתווך מורשה</DialogTitle>
          <DialogDescription className="text-right text-base leading-relaxed">
            {publisher ? 'אימות החשבון והרישיון נדרש לפני פרסום כמתווך.' : 'מתווך מורשה מקבל גישה לעמלות סגירה ולכלי התיווך. כך מקבלים רישיון:'}
          </DialogDescription>
        </DialogHeader>
        {!publisher && <ol className="list-decimal space-y-1 ps-5 text-base text-foreground">
          <li>לומדים לקראת מבחן התיווך בקורס מקוון.</li>
          <li>נרשמים למבחן הלאומי של רשם המתווכים ועוברים אותו.</li>
          <li>מקבלים רישיון ומזינים כאן את מספרו ואת צילום התעודה.</li>
        </ol>}
        {!publisher && <div className="flex items-center justify-between gap-2">
          <Button asChild variant="outline" className="flex-1"><a href={BROKER_COURSE_URL} target="_blank" rel="noopener noreferrer">לקורס</a></Button>
          <Button asChild variant="outline" className="flex-1"><a href={BROKER_EXAM_REGISTRATION_URL} target="_blank" rel="noopener noreferrer">להרשמה למבחן הלאומי</a></Button>
        </div>}
        {publisher && account?.verified ? <div className="space-y-3"><p>הרישיון מאומת. נדרש אימות SMS של החשבון לפני הפרסום.</p>{sms.data !== true && <WhatsAppOtpVerify smsOnly brokerVerification defaultPhone={user?.phone ?? ''} lockPhone={!!user?.phone} title="אימות ב-SMS" onVerified={() => { void sms.refetch(); }} />}<Button disabled={sms.data !== true || busy} onClick={() => void continueVerified()}>המשך לפרסום</Button></div> : !isOwnProfile ? <p role="status" className="border-t border-border pt-3 text-base">בקשת השדרוג מוגשת מתוך החשבון האישי של בעל הפרופיל.</p> : pending ? <div role="status" className="space-y-2 border-t border-border pt-3 text-base">
          <p>מספר רישיון תיווך: <b dir="ltr">{account?.license}</b></p>
          <p>הבקשה בבדיקה. נעדכן אותך בהמשך.</p>
        </div> : <div className="space-y-2 border-t border-border pt-3">
          <p className="text-base font-semibold">כבר קיבלת רישיון?</p>
          <BrokerLicenseField bare value={license} onChange={setLicense} onVerified={() => {}} />
          {sms.data !== true && <WhatsAppOtpVerify smsOnly brokerVerification defaultPhone={user?.phone ?? ''} lockPhone={!!user?.phone} title="אימות ב-SMS" description="נדרש אימות מספר הטלפון של החשבון לפני אימות הרישיון." onVerified={() => { void sms.refetch(); }} />}
          <label htmlFor="broker-certificate-image" className="block text-base">צילום תעודת הרישיון</label>
          <Input id="broker-certificate-image" type="file" accept={CERTIFICATE_MIME_TYPES.join(',')} disabled={busy} className="h-auto text-base" onChange={event => {
            const next = event.target.files?.[0] ?? null;
            if (next && (!CERTIFICATE_MIME_TYPES.includes(next.type) || next.size === 0 || next.size > CERTIFICATE_MAX_BYTES)) { event.target.value = ''; setFile(null); toast.error('יש להעלות תמונת JPG, PNG או WEBP בגודל עד 5MB'); return; }
            setFile(next);
          }} />
        </div>}
        {result ? <div role="status" className="space-y-1 rounded-md border border-success bg-success/10 p-3 text-base">
          <p className="font-semibold text-success">{result === 'approved' ? 'החשבון שודרג למתווך מורשה' : 'הבקשה התקבלה'}</p>
          {result === 'pending' && <p>נעדכן אותך כשהבדיקה תסתיים.</p>}
        </div> : isOwnProfile && !pending && !(publisher && account?.verified) && <Button type="button" size="lg" className="w-full text-base" disabled={!ready || busy} onClick={() => void submit()}>
          {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}שדרוג החשבון
        </Button>}
      </DialogContent>
    </Dialog>
  </>;
}
