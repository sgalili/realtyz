import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { brokerLicenseSchema, brokerLicenseDigits, verifyBrokerLicense, INVALID_BROKER_LICENSE } from '@/lib/brokerLicense';
import { ClosingSplitNote } from '@/components/affiliate/ClosingSplitNote';
import { BrokerTestLinks } from '@/components/affiliate/BrokerClosingInfo';

export function BrokerLicenseField({ value, onChange, onVerified, compact = false, signup = false, bare = false, onChecking }: { onChecking?: (checking: boolean) => void; value: string; onChange: (value: string) => void; onVerified: (value: string | null, holderName?: string) => void; compact?: boolean; signup?: boolean; bare?: boolean }) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'valid' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [holderName, setHolderName] = useState('');
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;
  useEffect(() => {
    let cancelled = false;
    onVerifiedRef.current(null);
    setMessage('');
    setHolderName('');
    if (!value) { setStatus('idle'); return; }
    if (!brokerLicenseSchema.safeParse(value).success) { setStatus('error'); setMessage(INVALID_BROKER_LICENSE); return; }
    setStatus('checking');
    const timer = window.setTimeout(() => {
      void verifyBrokerLicense(value, 'check', true).then(result => {
        if (cancelled) return;
        setStatus('valid'); setHolderName(result.holderName ?? ''); onVerifiedRef.current(value, result.holderName);
      }).catch((error: unknown) => {
        if (cancelled) return;
        setStatus('error'); setMessage(error instanceof Error ? error.message : INVALID_BROKER_LICENSE);
      });
    }, 600);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [value]);
  useEffect(() => { onChecking?.(status === 'checking'); }, [status, onChecking]);
  return <div className="space-y-2">
    <Label className={compact || signup || bare ? 'sr-only' : 'font-semibold'} htmlFor="signup-broker-license">מספר רישיון תיווך ממשלתי *</Label>
    <Input className={signup ? 'h-12 text-xl font-bold placeholder:font-normal placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0' : compact ? 'auth-unified-field' : undefined} placeholder={signup || bare ? 'מספר רישיון תיווך ממשלתי *' : undefined} id="signup-broker-license" value={value} onChange={e => onChange(brokerLicenseDigits(e.target.value))} required aria-required="true" aria-invalid={status === 'error'} aria-describedby="signup-broker-license-status" inputMode="numeric" pattern="[1-9][0-9]{0,9}" maxLength={10} autoComplete="off" dir={signup && !value ? 'rtl' : 'ltr'} />
    <div id="signup-broker-license-status" aria-live="polite" className="text-sm">
      {status === 'checking' && <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />בודק בפנקס המתווכים…</span>}
      {status === 'valid' && <span className="flex flex-wrap items-center gap-1 text-success"><BadgeCheck className="h-4 w-4" aria-hidden />מאומת בפנקס המתווכים{holderName && <span> · {holderName}</span>}</span>}
      {status === 'error' && <span role="alert" className="text-destructive">{message}</span>}
    </div>
    {!signup && !bare && <><ClosingSplitNote registration /><BrokerTestLinks /></>}
  </div>;
}