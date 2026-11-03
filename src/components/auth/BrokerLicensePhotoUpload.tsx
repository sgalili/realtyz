import { notifyLicenseStatus } from '@/lib/licenseStatusNotify';
import { useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { CERTIFICATE_MAX_BYTES, CERTIFICATE_MIME_TYPES } from '../../../supabase/functions/_shared/brokerCertificate';

/** Private license photo for manual admin review; stored under the user's own folder. */
export async function uploadBrokerLicensePhoto(userId: string, file: File) {
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/license-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('broker-license-docs').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error('העלאת צילום הרישיון נכשלה. אפשר לנסות שוב.');
  return path;
}

export async function requestBrokerLicenseReview(license: string, certificatePath: string, details?: Record<string, string>) {
  const { error } = await supabase.rpc('request_broker_license_review' as never, { _license: license, _certificate_path: certificatePath, _details: details ?? null } as never);
  if (error) throw new Error('לא ניתן לשלוח את הרישיון לבדיקה כרגע.');
  const { data } = await supabase.auth.getUser();
  notifyLicenseStatus(data.user?.id);
}

export const BROKER_LICENSE_REVIEW_MESSAGE = 'אימות רישיון התיווך שלך נשלח לבדיקה ונעדכן אותך בקרוב.';

export function BrokerLicensePhotoUpload({ file, onFile }: { file: File | null; onFile: (file: File | null) => void }) {
  const [error, setError] = useState('');
  return <div className="space-y-2 border-t border-border pt-3">
    <label htmlFor="broker-license-photo" className="flex items-center gap-2 text-base font-semibold"><Upload className="h-4 w-4" />צילום / סריקה של רישיון התיווך *</label>
    <p className="text-sm text-muted-foreground">תמונת JPG, PNG או WEBP עד 5MB. הקובץ נשמר באופן פרטי לבדיקת מנהל בלבד.</p>
    <Input id="broker-license-photo" type="file" accept={CERTIFICATE_MIME_TYPES.join(',')} className="h-auto text-base" onChange={event => {
      const next = event.target.files?.[0] ?? null;
      if (next && (!CERTIFICATE_MIME_TYPES.includes(next.type as never) || next.size > CERTIFICATE_MAX_BYTES)) { setError('יש לבחור תמונה תקינה עד 5MB.'); onFile(null); return; }
      setError(''); onFile(next);
    }} />
    {file && <p className="text-sm text-muted-foreground">{file.name}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}

export function UploadingSpinner() { return <Loader2 className="h-4 w-4 animate-spin" />; }
