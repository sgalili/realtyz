import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { BrokerLicenseField } from '@/components/auth/BrokerLicenseField';
import { verifyBrokerLicense } from '@/lib/brokerLicense';
import { BrokerLicensePhotoUpload, uploadBrokerLicensePhoto, requestBrokerLicenseReview, BROKER_LICENSE_REVIEW_MESSAGE } from '@/components/auth/BrokerLicensePhotoUpload';

/** Shown in "הפרופיל שלי" only while an unverified broker is inside the signup grace period. */
export function BrokerLicenseGraceCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ['broker-license-grace', user?.id];
  const { data } = useQuery({
    queryKey: key,
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('broker_license_grace').select('license_number, expires_at, resolved_at, expired_at').eq('user_id', user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [license, setLicense] = useState('');
  const [verified, setVerified] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user || !data || data.resolved_at || data.expired_at || new Date(data.expires_at) < new Date()) return null;
  const daysLeft = Math.max(1, Math.ceil((new Date(data.expires_at).getTime() - Date.now()) / 86_400_000));
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); await queryClient.invalidateQueries({ queryKey: key }); }
    catch (error) { toast.error(error instanceof Error && /[א-ת]/.test(error.message) ? error.message : 'לא ניתן לשמור כרגע. אפשר לנסות שוב.'); }
    finally { setBusy(false); }
  };
  return <section dir="rtl" className="space-y-3 rounded-xl border border-warning/40 bg-warning/5 p-4">
    <h3 className="text-base font-bold">השלמת אימות רישיון התיווך</h3>
    <p className="text-sm">{data.license_number ? `לא הצלחנו לאמת את מספר הרישיון ${data.license_number}.` : 'עדיין לא הוזן מספר רישיון תיווך.'} החשבון פתוח במלואו עוד {daysLeft} ימים. בינתיים אפשר לעדכן את מספר הרישיון או להעלות צילום שלו.</p>
    <BrokerLicenseField bare value={license} onChange={setLicense} onVerified={value => setVerified(value)} />
    {verified && verified === license && <Button type="button" className="w-full" disabled={busy} onClick={() => void run(async () => { await verifyBrokerLicense(license, 'verify'); toast.success('הרישיון אומת בהצלחה.'); })}>אימות הרישיון</Button>}
    <BrokerLicensePhotoUpload file={photo} onFile={setPhoto} />
    {photo && <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void run(async () => { await requestBrokerLicenseReview(license || data.license_number, await uploadBrokerLicensePhoto(user.id, photo)); setPhoto(null); toast.success(BROKER_LICENSE_REVIEW_MESSAGE); })}>שליחת הצילום לבדיקה</Button>}
  </section>;
}
