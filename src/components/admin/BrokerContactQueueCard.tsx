import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Save, Loader2, Mail, UserRoundSearch } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { OfficialBrokerInvitationDialog } from './OfficialBrokerInvitationDialog';
import { BrokerEmailConsentButton } from './BrokerEmailInvitations';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { toast } from 'sonner';

export type ContactBroker = { user_id: string; full_name: string; phone: string | null; email: string | null; license_number: string | null; office_name: string | null; drafts: number; contact_status: 'pending_contact' | 'complete'; first_login_at: string | null; email_consent_at: string | null; email_invited_at: string | null };

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) { const d = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null; throw new Error(typeof d?.error === 'string' ? d.error : 'הפעולה נכשלה'); }
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

function BrokerRow({ b }: { b: ContactBroker }) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState(b.phone ? formatPhoneDisplay(b.phone) : '');
  const [email, setEmail] = useState(b.email ?? '');
  const save = useMutation({
    mutationFn: () => invoke<{ complete: boolean }>('admin-broker-contact', { action: 'save', user_id: b.user_id, phone: phone.trim() || undefined, email: email.trim() || undefined }),
    onSuccess: d => { toast.success(d.complete ? 'הפרטים נשמרו · אפשר לשלוח הזמנה' : 'האימייל נשמר · עדיין נדרש נייד'); void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const sendEmail = useMutation({
    mutationFn: () => invoke<{ sent: number }>('admin-broker-email-invitation', { action: 'send_batch', broker_id: b.user_id, limit: 1 }),
    onSuccess: d => { d.sent ? toast.success('ההזמנה נשלחה באימייל') : toast.error('האימייל לא נשלח'); void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const complete = b.contact_status === 'complete' && !!b.phone;
  const dirty = (phone.trim() && phone.replace(/\D/g, '') !== (b.phone ? formatPhoneDisplay(b.phone).replace(/\D/g, '') : '')) || (email.trim() && email.trim().toLowerCase() !== (b.email ?? ''));
  return <li className="space-y-3 rounded-xl border border-border/70 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="space-y-1"><p className="text-lg font-bold">{b.full_name || 'ללא שם'}</p><p className="text-base text-muted-foreground">{[b.license_number && `רישיון ${b.license_number}`, b.office_name, `${b.drafts} טיוטות`].filter(Boolean).join(' · ')}</p></div>
      <Badge variant={complete ? 'default' : 'secondary'} className="text-sm">{complete ? 'פרטי התקשרות הושלמו' : 'ממתין להשלמת פרטי התקשרות'}</Badge>
    </div>
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <Input aria-label={`נייד (WhatsApp) של ${b.full_name}`} className="h-11 text-base" dir="ltr" inputMode="tel" placeholder="05X-XXXXXXX" value={phone} onChange={e => setPhone(e.target.value)} />
      <Input aria-label={`אימייל של ${b.full_name}`} className="h-11 text-base" dir="ltr" type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} />
      <Button className="h-11 text-base" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}שמירה</Button>
    </div>
    {complete && <div className="flex flex-wrap items-center gap-2">
      <OfficialBrokerInvitationDialog broker={{ id: b.user_id, full_name: b.full_name }} />
      {b.email && <BrokerEmailConsentButton broker={{ id: b.user_id, full_name: b.full_name, email: b.email }} state={{ email_consent_at: b.email_consent_at, email_unsubscribed_at: null, email_invited_at: b.email_invited_at }} />}
      {b.email && b.email_consent_at && !b.email_invited_at && <Button variant="outline" disabled={sendEmail.isPending} onClick={() => sendEmail.mutate()}>{sendEmail.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}שליחת הזמנה באימייל</Button>}
      {b.email_invited_at && <span className="text-sm text-muted-foreground">הזמנה נשלחה באימייל</span>}
    </div>}
  </li>;
}

/** Bright Data imported brokers that still need a mobile or email entered by a Super Admin. */
export function BrokerContactQueueCard() {
  const q = useQuery({ queryKey: ['broker-contact-queue'], queryFn: () => invoke<{ brokers: ContactBroker[] }>('admin-broker-contact', { action: 'list' }) });
  const brokers = q.data?.brokers ?? [];
  const pending = brokers.filter(b => b.contact_status === 'pending_contact').length;
  return <section dir="rtl" className="space-y-4 py-5 text-right">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-xl font-bold"><UserRoundSearch className="h-5 w-5 text-primary" />השלמת פרטי התקשרות</h3>{pending > 0 && <Badge variant="secondary" className="text-sm">{pending} ממתינים</Badge>}</div>
    {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : q.isError ? <p role="alert" className="text-base text-destructive">{(q.error as Error).message}</p> : brokers.length === 0 ? <p className="text-base text-muted-foreground">אין מתווכים שממתינים להשלמת פרטים.</p> :
      <ul className="space-y-3">{brokers.map(b => <BrokerRow key={b.user_id} b={b} />)}</ul>}
  </section>;
}
