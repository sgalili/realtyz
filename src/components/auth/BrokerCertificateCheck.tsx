import { useEffect, useRef, useState } from 'react';
import { FileCheck2, Loader2, Upload, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CERTIFICATE_MAX_BYTES, CERTIFICATE_MIME_TYPES } from '../../../supabase/functions/_shared/brokerCertificate';

type CheckResult = { matched: boolean; licenseNumber?: string; fullName?: string; message: string };
export function BrokerCertificateCheck({ onResult }: { onResult?: (result: CheckResult | null) => void } = {}) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { onResult?.(result); }, [result, onResult]);
  useEffect(() => () => request.current?.abort(), [user?.id]);
  const check = async () => {
    if (!file || busy) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setResult(null);
    try {
      const body = new FormData(); body.set('certificate', file);
      const { data, error } = await supabase.functions.invoke('check-broker-certificate', { body, signal: controller.signal });
      if (controller.signal.aborted) return;
      if (error) {
        let message = 'לא ניתן לבדוק את התעודה כרגע.';
        if (error.context instanceof Response) { const failure = await error.context.json().catch(() => null); message = failure?.message ?? message; }
        setResult({ matched: false, message });
      } else setResult(data);
    } catch { if (!controller.signal.aborted) setResult({ matched: false, message: 'לא ניתן לבדוק את התעודה כרגע.' }); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  return <div className="space-y-2 border-t border-border pt-3">
    <label htmlFor="broker-certificate-image" className="block text-base font-semibold">בדיקת תעודת רישיון מול המרשם</label>
    <p className="text-sm text-muted-foreground">תמונת JPG, PNG או WEBP עד 5MB. התמונה אינה נשמרת.</p>
    <Input ref={input} id="broker-certificate-image" type="file" accept={CERTIFICATE_MIME_TYPES.join(',')} disabled={busy} className="h-auto text-base" onChange={event => {
      const next = event.target.files?.[0]; setResult(null); setFile(null);
      if (!next) return;
      if (!CERTIFICATE_MIME_TYPES.includes(next.type) || next.size === 0 || next.size > CERTIFICATE_MAX_BYTES) { event.target.value = ''; setResult({ matched: false, message: 'יש להעלות תמונת JPG, PNG או WEBP בגודל עד 5MB' }); return; }
      setFile(next);
    }} />
    {file && <div className="flex items-center justify-between gap-2">
      <Button type="button" variant="outline" disabled={busy} onClick={() => void check()}>{busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Upload className="me-2 h-4 w-4" />}{busy ? 'קוראים את התעודה ובודקים במרשם…' : 'בדיקת התעודה'}</Button>
      <Button type="button" variant="ghost" size="icon" aria-label={busy ? 'ביטול הבדיקה' : 'הסרת התעודה'} onClick={() => { request.current?.abort(); setBusy(false); setFile(null); setResult(null); if (input.current) input.current.value = ''; }}><X className="h-4 w-4" /></Button>
    </div>}
    {result && <div role={result.matched ? 'status' : 'alert'} className={result.matched ? 'space-y-1 text-sm text-success' : 'space-y-1 text-sm text-destructive'}>
      {result.matched && <FileCheck2 className="h-5 w-5" />}
      {result.fullName && <p className="text-foreground">{result.fullName} · רישיון {result.licenseNumber}</p>}
      <p>{result.message}</p>
    </div>}
  </div>;
}