import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BrokerInvitationDialog } from './BrokerInvitationDialog';
import { UserPlus, ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type UserType = 'broker' | 'developer' | 'property_owner' | 'property_seeker' | 'affiliate';
export function SuperAdminCreateUserCard() {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [license, setLicense] = useState('');
  const [userType, setUserType] = useState<UserType>('broker');
  const [approved, setApproved] = useState(false);
  const [registry, setRegistry] = useState<{ valid: boolean; reason?: string; holderName?: string } | null>(null);
  const [createdBroker, setCreatedBroker] = useState<{ id: string; full_name: string } | null>(null);
  const body = { full_name: fullName.trim(), phone_e164: phone, broker_license_number: userType === 'broker' ? license : undefined, approve_broker: approved, user_type: userType };
  const invoke = async (action: 'create' | 'check_registry') => {
    const { data, error } = await supabase.functions.invoke('super-admin-create-user', { body: { ...body, phone_e164: action === 'check_registry' ? undefined : body.phone_e164, action } });
    if (error) { const details = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null; throw new Error(typeof details?.error === 'string' ? details.error : 'הבקשה נכשלה'); }
    if (data.error || data.ok === false) throw new Error(typeof data.error === 'string' ? data.error : 'הבקשה נכשלה');
    return data;
  };
  const check = useMutation({ mutationFn: () => invoke('check_registry'), onSuccess: setRegistry, onError: (e: Error) => toast.error(e.message) });
  const create = useMutation({ mutationFn: () => invoke('create'), onSuccess: data => {
    if (userType === 'broker') setCreatedBroker({ id: data.user_id, full_name: fullName.trim() });
    toast.success('מרחב העבודה נוצר ללא שליחת הודעות');
    for (const key of ['admin-profiles', 'admin-all-roles', 'workspaces']) void qc.invalidateQueries({ queryKey: [key] });
  }, onError: (e: Error) => toast.error(e.message) });
  const resetVerification = () => { setRegistry(null); setApproved(false); };
  const ready = fullName.trim().length >= 2 && /^\+?(?:9725\d{8}|05\d{8})$/.test(phone.replace(/[-\s]/g, '')) && (userType !== 'broker' || (/^[1-9]\d{3,9}$/.test(license) && (registry?.valid || approved)));
  return <Card dir="rtl" className="border-primary/20">
    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserPlus className="h-4 w-4 text-primary" />יצירת משתמש חדש</CardTitle></CardHeader>
    <CardContent className="grid gap-3 md:grid-cols-2">
      <div className="grid gap-1.5"><Label htmlFor="su-name">שם מלא</Label><Input id="su-name" value={fullName} onChange={e => { setFullName(e.target.value); resetVerification(); }} /></div>
      <div className="grid gap-1.5"><Label htmlFor="su-phone">טלפון</Label><Input id="su-phone" inputMode="tel" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} /></div>
      <div className="grid gap-1.5"><Label htmlFor="su-type">סוג משתמש</Label><Select value={userType} onValueChange={v => { setUserType(v as UserType); resetVerification(); }}><SelectTrigger id="su-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="broker">מתווך</SelectItem><SelectItem value="developer">יזם / חברה</SelectItem><SelectItem value="property_owner">בעל נכס</SelectItem><SelectItem value="property_seeker">מחפש נכס</SelectItem><SelectItem value="affiliate">שותף</SelectItem></SelectContent></Select></div>
      {userType === 'broker' && <>
        <div className="grid gap-1.5"><Label htmlFor="su-license">מספר רישיון תיווך</Label><Input id="su-license" inputMode="numeric" dir="ltr" value={license} onChange={e => { setLicense(e.target.value.replace(/\D/g, '')); resetVerification(); }} /></div>
        <div className="md:col-span-2"><Button variant="outline" disabled={!/^[1-9]\d{3,9}$/.test(license) || fullName.trim().length < 2 || check.isPending || registry?.valid} onClick={() => check.mutate()}>{check.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{registry?.valid ? `מאומת · ${registry.holderName}` : 'אימות מול המאגר הלאומי'}</Button></div>
        {registry && !registry.valid && <div className="md:col-span-2 space-y-2"><p className="text-sm text-muted-foreground">{registry.reason === 'unavailable' ? 'המאגר אינו זמין כרגע' : registry.reason === 'name_mismatch' ? 'השם אינו תואם לרישיון במאגר' : 'לא נמצאה התאמה במאגר'}</p><div className="flex items-center gap-2"><Checkbox id="su-approve" checked={approved} onCheckedChange={v => setApproved(v === true)} /><Label htmlFor="su-approve">אישור ידני של Super Admin לרישיון זה</Label></div></div>}
      </>}
      {createdBroker && <div className="md:col-span-2 flex items-center gap-2"><span className="text-sm">הזמנה עבור {createdBroker.full_name}</span><BrokerInvitationDialog broker={createdBroker} /></div>}
      <div className="md:col-span-2 flex justify-end"><Button disabled={!ready || create.isPending || check.isPending} onClick={() => create.mutate()}>{create.isPending ? 'יוצר…' : 'יצירת מרחב עבודה'}</Button></div>
    </CardContent>
  </Card>;
}
export default SuperAdminCreateUserCard;
