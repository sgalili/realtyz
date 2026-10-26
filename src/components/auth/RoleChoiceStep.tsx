import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { userRolesQueryKey } from '@/hooks/useUserRole';
import { clearPendingSignupRole, markPostSignupWelcome } from '@/lib/signupRole';
import realtyzLogo from '@/assets/realtyz-logo.webp';
import { BrokerLicenseField } from '@/components/auth/BrokerLicenseField';
import { verifyBrokerLicense, INVALID_BROKER_LICENSE } from '@/lib/brokerLicense';
import { clearSmsSignup, readSmsSignup, signupDetailsValid, signupRpc, signupTypeFields, signupTypes, type SmsSignupType } from '@/lib/smsSignup';

export const PRIMARY_SIGNUP_TYPES = signupTypes;
const labels: Record<SmsSignupType, string> = { property_owner: 'בעל נכס', property_seeker: 'קונה/שוכר', broker: 'מתווך/סוכנות', developer: 'יזם/קבלן', partner: 'תוכנית שותפים' };
export function RoleChoiceStep({ onDone }: { onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<SmsSignupType | null>(null);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [license, setLicense] = useState('');
  const [verifiedLicense, setVerifiedLicense] = useState<string | null>(null);
  const [licenseSuspended, setLicenseSuspended] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    void supabase.from('broker_role_suspensions').select('role').eq('user_id', user.id).then(({ data }) => {
      if (alive && (data?.length ?? 0) > 0) { setLicenseSuspended(true); setSelected('broker'); }
    });
    return () => { alive = false; };
  }, [user?.id]);
  const ready = selected && signupDetailsValid(selected, details) && (selected !== 'broker' || (!!license && verifiedLicense === license));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !user || !selected || !ready) return;
    setBusy(true);
    try {
      const pending = readSmsSignup();
      if (pending) await signupRpc('complete_sms_signup', { _first_name: pending.firstName, _last_name: pending.lastName, _gender: pending.gender, _phone: pending.phone });
      if (selected === 'broker') await verifyBrokerLicense(license, 'verify');
      if (licenseSuspended) {
        const { data, error } = await supabase.rpc('select_signup_user_type', { _type: 'broker' });
        if (error || !(data as { ok?: boolean } | null)?.ok) throw new Error(error?.message ?? INVALID_BROKER_LICENSE);
      } else await signupRpc('complete_sms_signup_details', { _type: selected, _details: details });
      markPostSignupWelcome(selected);
      clearSmsSignup(); clearPendingSignupRole();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: userRolesQueryKey(user.id) }),
        queryClient.invalidateQueries({ queryKey: ['workspace-owner-roles'] }),
        queryClient.invalidateQueries({ queryKey: ['primary-user-type'] }),
        queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
        queryClient.invalidateQueries({ queryKey: ['app-header-user-profile', user.id] }),
      ]);
      onDone?.(); navigate('/', { replace: true });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'לא ניתן לשמור. נסו שוב.'); }
    finally { setBusy(false); }
  };
  return <div dir="rtl" className="flex h-[100dvh] flex-col items-center overflow-y-auto bg-background px-4 pb-16 pt-[40px]">
    <img src={realtyzLogo} alt="TORAFF" className="h-14 w-auto shrink-0 object-contain" />
    <h1 className="mb-6 mt-[50px] text-xl font-bold">מה סוג המשתמש שלך?</h1>
    {licenseSuspended && <div role="alert" className="mb-4 w-full max-w-lg border border-destructive p-3 text-destructive">{INVALID_BROKER_LICENSE}</div>}
    <div role="group" aria-label="סוג משתמש" className="grid w-full max-w-lg grid-cols-2 gap-3">{signupTypes.map(type => <Button key={type} type="button" variant={selected === type ? 'default' : 'outline'} aria-pressed={selected === type} className="h-16 whitespace-normal text-lg font-semibold" disabled={busy || (licenseSuspended && type !== 'broker')} onClick={() => { setSelected(type); setDetails({}); }}>{labels[type]}</Button>)}</div>
    {selected && <form onSubmit={submit} className="mt-6 w-full max-w-lg space-y-3">
      {signupTypeFields[selected].map(([key, label]) => <Input key={key} aria-label={label} placeholder={label} maxLength={200} type={key === 'budget' ? 'number' : 'text'} min={key === 'budget' ? 1 : undefined} className="h-12 text-xl font-bold" value={details[key] ?? ''} onChange={e => setDetails(previous => ({ ...previous, [key]: e.target.value }))} />)}
      {selected === 'broker' && <BrokerLicenseField value={license} onChange={setLicense} onVerified={setVerifiedLicense} />}
      <Button type="submit" className="h-12 w-full text-lg" disabled={busy || !ready}>{busy ? 'שומר...' : 'המשך'}</Button>
    </form>}
  </div>;
}
export default RoleChoiceStep;
