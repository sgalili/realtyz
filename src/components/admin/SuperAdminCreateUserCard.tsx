import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { UserPlus, Copy } from 'lucide-react';
import { toast } from 'sonner';

function genPassword(length = 12) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
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
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState(genPassword());
  const [sendWa, setSendWa] = useState(true);

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('super-admin-create-user', {
        body: {
          email: email.trim(),
          password,
          full_name: fullName.trim() || undefined,
          phone_e164: phone ? normalizePhone(phone) : undefined,
          send_whatsapp: sendWa && !!phone,
          initial_balance_agorot: 100000,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(
        `נוצר חשבון ל-${email}` +
          (data?.wa_status === 'sent' ? ' · נשלח WhatsApp' :
           data?.wa_status === 'failed' ? ` · WhatsApp נכשל: ${data?.wa_error ?? ''}` : ''),
      );
      setEmail(''); setFullName(''); setPhone(''); setPassword(genPassword());
    },
    onError: (e: Error) => toast.error(e.message || 'יצירת משתמש נכשלה'),
  });

  const copyCreds = async () => {
    await navigator.clipboard.writeText(`Email: ${email}\nPassword: ${password}`);
    toast.success('פרטי ההתחברות הועתקו');
  };

  return (
    <Card dir="rtl" className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-4 w-4 text-primary" /> יצירת משתמש חדש (Workspace)
        </CardTitle>
        <CardDescription>
          כל משתמש שייווצר כאן יקבל מרחב עבודה נפרד עם 1,000 ₪ יתרה, חבילה ללא הגבלת מתעניינים/נכסים/דאטה.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="su-email">אימייל</Label>
          <Input id="su-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="su-name">שם מלא</Label>
          <Input id="su-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="שם מלא" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="su-phone">טלפון WhatsApp (אופציונלי)</Label>
          <Input id="su-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05X-XXXXXXX" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="su-pwd">סיסמה זמנית</Label>
          <div className="flex gap-2">
            <Input id="su-pwd" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="button" variant="outline" onClick={() => setPassword(genPassword())}>חדש</Button>
            <Button type="button" variant="outline" size="icon" onClick={copyCreds} title="העתק">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="md:col-span-2 flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
          <div>
            <p className="text-sm font-medium">שליחת פרטי התחברות ב-WhatsApp (GreenAPI)</p>
            <p className="text-xs text-muted-foreground">דורש מספר טלפון. נשלח דרך חשבון ה-WA המחובר ל-Super Admin.</p>
          </div>
          <Switch checked={sendWa} onCheckedChange={setSendWa} />
        </div>
        <div className="md:col-span-2 flex justify-end">
          <Button onClick={() => create.mutate()} disabled={!email || !password || create.isPending}>
            {create.isPending ? 'יוצר…' : 'צור משתמש + Workspace'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default SuperAdminCreateUserCard;
