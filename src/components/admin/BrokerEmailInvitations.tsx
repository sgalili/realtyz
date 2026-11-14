import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Mail, MailCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { hasNewAdminItems } from '@/lib/adminUserFilters';

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-broker-email-invitation', { body });
  if (error) {
    const d = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    throw new Error(typeof d?.error === 'string' ? d.error : 'הפעולה נכשלה');
  }
  return data;
}

export type BrokerEmailState = { email_consent_at: string | null; email_unsubscribed_at: string | null; email_invited_at: string | null };

export function useBrokerEmailStates(enabled: boolean) {
  return useQuery({ queryKey: ['broker-email-states'], enabled, queryFn: async () => {
    const { data, error } = await supabase.from('admin_broker_onboarding').select('user_id,email_consent_at,email_unsubscribed_at,email_invited_at');
    if (error) throw error;
    return Object.fromEntries((data ?? []).map(r => [r.user_id, r as BrokerEmailState]));
  } });
}

export function BrokerEmailConsentButton({ broker, state }: { broker: { id: string; full_name?: string | null; email?: string | null }; state?: BrokerEmailState }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const qc = useQueryClient();
  const m = useMutation({ mutationFn: (revoke: boolean) => invoke({ action: 'consent', broker_id: broker.id, note: revoke ? 'revoked' : note, revoke }), onSuccess: () => { setOpen(false); void qc.invalidateQueries({ queryKey: ['broker-email-states'] }); void qc.invalidateQueries({ queryKey: ['broker-email-summary'] }); }, onError: e => toast.error(e.message) });
  if (!state) return null;
  const label = state.email_unsubscribed_at ? 'הוסר מדיוור' : state.email_invited_at ? 'אימייל נשלח' : state.email_consent_at ? 'הסכים לאימייל' : 'רישום הסכמה לאימייל';
  return <>
    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={label} title={label} disabled={!!state.email_unsubscribed_at || !!state.email_invited_at} onClick={() => { setNote(''); setOpen(true); }}>{state.email_consent_at ? <MailCheck className="h-4 w-4" /> : <Mail className="h-4 w-4" />}</Button>
    <Dialog open={open} onOpenChange={v => !m.isPending && setOpen(v)}><DialogContent dir="rtl" className="max-w-md text-right">
      <DialogHeader><DialogTitle>הסכמה לקבלת אימייל · {broker.full_name || 'מתווך'}</DialogTitle><DialogDescription>אימייל הזמנה יישלח רק אחרי שהמתווך אישר שהוא רוצה לקבל אותו, למשל בשיחה או בתשובה ב־WhatsApp. {broker.email ? `כתובת: ${broker.email}` : 'אין כתובת אימייל במערכת.'}</DialogDescription></DialogHeader>
      {state.email_consent_at ? <p className="text-sm">ההסכמה נרשמה ב־{new Date(state.email_consent_at).toLocaleString('he-IL')}.</p> : <div className="space-y-2"><Label htmlFor={`consent-${broker.id}`}>איך התקבלה ההסכמה?</Label><Input id={`consent-${broker.id}`} value={note} maxLength={300} placeholder="השיב כן ב־WhatsApp ב־10.11" onChange={e => setNote(e.target.value)} /></div>}
      <DialogFooter className="flex-row justify-between gap-2 sm:justify-between"><Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button>{state.email_consent_at ? <Button variant="destructive" disabled={m.isPending} onClick={() => m.mutate(true)}>ביטול ההסכמה</Button> : <Button disabled={m.isPending || note.trim().length < 3 || !broker.email} onClick={() => m.mutate(false)}>אישור הסכמה</Button>}</DialogFooter>
    </DialogContent></Dialog>
  </>;
}

export function BrokerEmailBatchCard() {
  const qc = useQueryClient();
  const summary = useQuery({ queryKey: ['broker-email-summary'], refetchInterval: 30000, queryFn: () => invoke({ action: 'summary' }) as Promise<{ eligible: number; batch_max: number }> });
  const send = useMutation({ mutationFn: () => invoke({ action: 'send_batch' }) as Promise<{ sent: number; failed: number; remaining: number }>, onSuccess: d => {
    toast[d.failed ? 'warning' : 'success'](`נשלחו ${d.sent} אימיילים${d.failed ? `, ${d.failed} נכשלו` : ''}. נותרו ${d.remaining}.`);
    void qc.invalidateQueries({ queryKey: ['broker-email-summary'] }); void qc.invalidateQueries({ queryKey: ['broker-email-states'] });
  }, onError: e => toast.error(e.message) });
  const n = summary.data?.eligible ?? 0;
  if (summary.isError) return <p role="alert" className="text-destructive">לא ניתן לבדוק הזמנות באימייל</p>;
  if (!hasNewAdminItems(n)) return null;
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-right">
    <div><p className="font-medium">הזמנות באימייל למתווכים שהסכימו</p><p className="text-sm text-muted-foreground">{summary.isLoading ? 'בודק…' : summary.isError ? 'לא ניתן לבדוק כרגע' : `${n} מתווכים ממתינים · נשלח עד ${summary.data?.batch_max ?? 25} בכל מנה`}</p></div>
    <Button disabled={!n || send.isPending} onClick={() => send.mutate()}><Mail className="h-4 w-4" />{send.isPending ? 'שולח…' : `שליחת מנה (${Math.min(n, summary.data?.batch_max ?? 25)})`}</Button>
  </div>;
}
