import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IsraeliCityPicker } from '@/components/IsraeliCityPicker';
import { ArrowRight, X } from 'lucide-react';
import { genderText, personalGenderKey, usePersonalLanguage } from '@/i18n/personalLanguage';
import { useAuth } from '@/hooks/useAuth';
import { userRolesQueryKey } from '@/hooks/useUserRole';
import { clearPendingSignupRole, markPostSignupWelcome } from '@/lib/signupRole';
import realtyzLogo from '@/assets/realtyz-logo.webp';
import { BrokerLicenseField } from '@/components/auth/BrokerLicenseField';
import { verifyBrokerLicense, INVALID_BROKER_LICENSE } from '@/lib/brokerLicense';
import { clearSmsSignup, readSmsSignup, signupDetailsValid, signupRpc, signupTypeFields, signupTypes, type SmsSignupType } from '@/lib/smsSignup';

export const PRIMARY_SIGNUP_TYPES = signupTypes;
const labels: Record<SmsSignupType, string> = { property_owner: 'בעל נכס', property_seeker: 'קונה/שוכר', broker: 'מתווך/סוכנות', developer: 'יזם/קבלן', partner: 'תוכנית שותפים' };
const femaleLabels: Record<SmsSignupType, string> = { property_owner: 'בעלת נכס', property_seeker: 'קונה/שוכרת', broker: 'מתווכת/סוכנות', developer: 'יזמית/קבלנית', partner: 'תוכנית שותפים' };
const propertyTypes = ['דירה', 'דירת גן', 'דירת גג', 'בית פרטי', 'קוטג׳', 'פנטהאוז', 'דופלקס', 'סטודיו', 'וילה', 'מגרש', 'נכס מסחרי', 'אחר'];
const fieldClass = 'h-12 text-xl font-bold text-foreground placeholder:font-normal placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0';
export function RoleChoiceStep({ onDone }: { onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<SmsSignupType | null>(null);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [license, setLicense] = useState('');
  const [verifiedLicense, setVerifiedLicense] = useState<string | null>(null);
  const [licenseSuspended, setLicenseSuspended] = useState(false);
  const { user } = useAuth();
  const { gender: savedGender } = usePersonalLanguage();
  const pending = readSmsSignup();
  const gender = pending?.gender ?? savedGender;
  const currentLabels = gender === 'female' ? femaleLabels : labels;
  const wording = (male: string, female: string, neutral = male) => genderText(gender, { male, female, neutral });
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
      if (pending) {
        await signupRpc('complete_sms_signup', { _first_name: pending.firstName, _last_name: pending.lastName, _gender: pending.gender, _phone: pending.phone });
        queryClient.setQueryData(personalGenderKey(user.id), pending.gender);
      }
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
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const friendly: Record<string, string> = { invalid_details: 'יש להשלים את כל הפרטים לפני ההמשך.', invalid_budget: 'יש להזין תקציב חיובי במספרים בלבד.', primary_type_already_selected: 'סוג המשתמש כבר נשמר. יש לרענן את העמוד.', invalid_deal_type: 'יש לבחור למכירה או להשכרה.' };
      toast.error(friendly[message] ?? (/^[\s\S]*[א-ת]/.test(message) ? message : 'לא ניתן לשמור את הפרטים כרגע. אפשר לנסות שוב.'));
    }
    finally { setBusy(false); }
  };
  return <div dir="rtl" className="relative flex h-[100dvh] flex-col items-center overflow-y-auto bg-background px-4 pb-16 pt-[50px]">
    <Button type="button" variant="ghost" size="icon" aria-label="סגירה" className="absolute left-4 top-4 h-10 w-10" onClick={() => navigate('/auth')}><X className="h-8 w-8" /></Button>
    <Button type="button" variant="ghost" size="icon" aria-label="חזרה" className="absolute right-4 top-4 h-10 w-10" disabled={busy} onClick={() => { if (selected && !licenseSuspended) setSelected(null); else navigate('/auth'); }}><ArrowRight className="h-8 w-8" /></Button>
    <img src={realtyzLogo} alt="TORAFF" className="h-14 w-auto shrink-0 object-contain" />
    <h1 className="mb-8 mt-[100px] text-center text-[17px] !font-normal">{selected ? currentLabels[selected] : wording('מה סוג המשתמש שלך?', 'מה סוג המשתמשת שלך?', 'מה סוג החשבון שלך?')}</h1>
    {licenseSuspended && <div role="alert" className="mb-4 w-full max-w-lg border border-destructive p-3 text-destructive">{INVALID_BROKER_LICENSE}</div>}
    {!selected && <div role="group" aria-label="סוג משתמש" className="grid w-full max-w-lg grid-cols-2 gap-3">{signupTypes.map(type => <Button key={type} type="button" variant="outline" className="h-16 whitespace-normal text-lg font-normal" disabled={busy || (licenseSuspended && type !== 'broker')} onClick={() => { setSelected(type); setDetails({}); }}>{currentLabels[type]}</Button>)}</div>}
    {selected && <form onSubmit={submit} className="w-full max-w-lg space-y-3">
      {signupTypeFields[selected].map(([key, label]) => {
        const value = details[key] ?? '';
        const change = (next: string) => setDetails(previous => ({ ...previous, [key]: next }));
        if (key === 'property_area' || key === 'search_area') return <IsraeliCityPicker key={key} value={value} onChange={change} placeholder={label} className={fieldClass} />;
        if (key === 'deal_type' || key === 'property_type') {
          const options = key === 'deal_type' ? [['sale', 'למכירה'], ['rent', 'להשכרה']] : propertyTypes.map(type => [type, type]);
          return <Select key={key} value={value} onValueChange={change}><SelectTrigger aria-label={label} className={`${fieldClass} data-[placeholder]:font-normal data-[placeholder]:text-muted-foreground focus:ring-0 focus:ring-offset-0`}><SelectValue placeholder={label} /></SelectTrigger><SelectContent>{options.map(([option, text]) => <SelectItem key={option} value={option}>{text}</SelectItem>)}</SelectContent></Select>;
        }
        if (key === 'main_project') return <div key={key} className="space-y-2"><label htmlFor="signup-developer-url" className="block font-normal">ייבוא פרוייקטים</label><p className="text-sm font-normal">{wording('הדבק כאן קישור לעמוד החברה שלך ב יד2:', 'הדביקי כאן קישור לעמוד החברה שלך ב יד2:')}</p><Input id="signup-developer-url" type="url" aria-label="קישור לעמוד החברה ביד2" placeholder="https://www.yad2.co.il/yad1/developers/1000000" className={`${fieldClass} text-base`} dir="ltr" maxLength={200} value={value} onChange={e => change(e.target.value)} /></div>;
        return <Input key={key} aria-label={label} placeholder={label} maxLength={200} type={key === 'budget' ? 'number' : 'text'} min={key === 'budget' ? 1 : undefined} className={fieldClass} value={value} onChange={e => change(e.target.value)} />;
      })}
      {selected === 'broker' && <BrokerLicenseField signup value={license} onChange={setLicense} onVerified={setVerifiedLicense} />}
      {ready && <Button type="submit" className="h-12 w-full text-lg" disabled={busy}>{busy ? 'שמירה...' : wording('המשך', 'המשיכי', 'המשך')}</Button>}
    </form>}
  </div>;
}
export default RoleChoiceStep;
