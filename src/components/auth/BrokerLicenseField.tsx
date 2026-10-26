import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { brokerLicenseSchema, brokerLicenseDigits, verifyBrokerLicense, INVALID_BROKER_LICENSE } from '@/lib/brokerLicense';
import { ClosingSplitNote } from '@/components/affiliate/ClosingSplitNote';
import { BrokerTestLinks } from '@/components/affiliate/BrokerClosingInfo';

export function BrokerLicenseField({ value, onChange, onVerified, compact = false, signup = false }: { value: string; onChange: (value: string) => void; onVerified: (value: string | null) => void; compact?: boolean; signup?: boolean }) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'valid' | 'error'>('idle');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let cancelled = false;
    onVerified(null);
    setMessage('');
    if (!value) { setStatus('idle'); return; }
    if (!brokerLicenseSchema.safeParse(value).success) { setStatus('error'); setMessage(INVALID_BROKER_LICENSE); return; }
    setStatus('checking');
    const timer = window.setTimeout(() => {
      void verifyBrokerLicense(value).then(() => {
        if (cancelled) return;
        setStatus('valid'); onVerified(value);
      }).catch((error: unknown) => {
        if (cancelled) return;
        setStatus('error'); setMessage(error instanceof Error ? error.message : INVALID_BROKER_LICENSE);
      });
    }, 600);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [value, onVerified]);
  return <div className="space-y-2">
    <Label className={compact || signup ? 'sr-only' : 'font-semibold'} htmlFor="signup-broker-license">מספר רישיון תיווך ממשלתי *</Label>
    <Input className={signup ? 'h-12 text-xl font-bold placeholder:font-normal placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0' : compact ? 'auth-unified-field' : undefined} placeholder={signup ? 'מספר רישיון תיווך ממשלתי *' : undefined} id="signup-broker-license" value={value} onChange={e => onChange(brokerLicenseDigits(e.target.value))} required aria-required="true" aria-invalid={status === 'error'} aria-describedby="signup-broker-license-status" inputMode="numeric" pattern="[1-9][0-9]{0,9}" maxLength={10} autoComplete="off" dir={signup && !value ? 'rtl' : 'ltr'} />
    <div id="signup-broker-license-status" aria-live="polite" className="text-sm">
      {status === 'checking' && <span className="text-muted-foreground">בודקים בפנקס המתווכים המורשים…</span>}
      {status === 'valid' && <span className="text-success">הרישיון נמצא בפנקס המתווכים המורשים</span>}
      {status === 'error' && <span role="alert" className="text-destructive">{message}</span>}
    </div>
    {!signup && <><ClosingSplitNote registration /><BrokerTestLinks /></>}
  </div>;
}