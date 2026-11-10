import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { BrokerInvitationDialog } from './BrokerInvitationDialog';
import { UserPlus, Copy } from 'lucide-react';
import { toast } from 'sonner';

function genPassword(length = 12) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%';
  let out = '';
  for (const value of crypto.getRandomValues(new Uint32Array(length))) out += chars[value % chars.length];
  return out;
}

function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return '972' + digits.slice(1);
  return digits;
}

export function SuperAdminCreateUserCard() {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState(genPassword());
  const [license, setLicense] = useState('');
  const [approved, setApproved] = useState(false);
  const [createdBroker, setCreatedBroker] = useState<{ id: string; full_name: string } | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('super-admin-create-user', {
        body: {
          email: email.trim(),
          password,
          full_name: fullName.trim() || undefined,
          phone_e164: phone ? normalizePhone(phone) : undefined,
          broker_license_number: license,
          approve_broker: approved,
          initial_balance_agorot: 100000,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
      return data;
    },
    onSuccess: (data: any) => {
      setCreatedBroker({ id: data.user_id, full_name: fullName.trim() });
      toast.success('מרחב העבודה נוצר ללא שליחת הודעות');
      void qc.invalidateQueries({ queryKey: ['admin-profiles'] });
      void qc.invalidateQueries({ queryKey: ['admin-all-roles'] });
      void qc.invalidateQueries({ queryKey: ['workspaces'] });
      // Keep form values so the admin can copy / re-send creds. Only refresh the password suggestion.
    },
    onError: (e: Error) => toast.error(e.message || 'יצירת משתמש נכשלה'),
  });

  const copyCreds = async () => {
    await navigator.clipboard.writeText(`Email: ${email}\nPassword: ${password}`);
    toast.success('פרטי ההתחברות הועתקו');
  };

  const handleSubmit = (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!email || !password || create.isPending) return;
    create.mutate();
  };

  const blockEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.preventDefault();
  };

  return (
    <Card dir="rtl" className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-4 w-4 text-primary" /> יצירת משתמש חדש (Workspace)
        </CardTitle>
        <CardDescription>
          הקמת מתווך שקטה. לא יישלחו הודעות SMS או WhatsApp בזמן ההקמה והייבוא.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="su-email">אימייל</Label>
          <Input id="su-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={blockEnter} placeholder="user@example.com" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="su-name">שם מלא</Label>
          <Input id="su-name" value={fullName} onChange={(e) => setFullName(e.target.value)} onKeyDown={blockEnter} placeholder="שם מלא" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="su-phone">טלפון WhatsApp</Label>
          <Input id="su-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={blockEnter} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="su-pwd">סיסמה זמנית</Label>
          <div className="flex gap-2">
            <Input id="su-pwd" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={blockEnter} />
            <Button type="button" variant="outline" onClick={() => setPassword(genPassword())}>חדש</Button>
            <Button type="button" variant="outline" size="icon" onClick={copyCreds} title="העתק">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="grid gap-1.5"><Label htmlFor="su-license">מספר רישיון תיווך</Label><Input id="su-license" inputMode="numeric" dir="ltr" value={license} onChange={e => { setLicense(e.target.value.replace(/\D/g, '')); setApproved(false); }} /></div>
        <div className="flex items-center gap-2"><Checkbox id="su-approve" checked={approved} onCheckedChange={v => setApproved(v === true)} /><Label htmlFor="su-approve">אני מאשר/ת במפורש את רישיון המתווך</Label></div>
        {createdBroker && <div className="md:col-span-2 flex items-center gap-2"><span className="text-sm">הזמנה עבור {createdBroker.full_name}</span><BrokerInvitationDialog broker={createdBroker} /></div>}
        <div className="md:col-span-2 flex justify-end">
          <Button type="button" onClick={handleSubmit} disabled={!email || !password || !phone || !/^[1-9][0-9]{3,9}$/.test(license) || !approved || create.isPending}>
            {create.isPending ? 'יוצר…' : 'צור משתמש + Workspace'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default SuperAdminCreateUserCard;
