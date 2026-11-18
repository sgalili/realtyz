import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import { MarketingCompanyLine } from './MarketingCompanyLine';

export type MarketingContact = { company_id: string | null; company_name: string | null; contact_name: string | null; contact_phone: string | null; contact_gender: string | null };

/** 05XXXXXXXX / +972... -> 9725XXXXXXXX, or null when not an Israeli mobile. */
export function toIntlMobile(v: string): string | null {
  const d = v.replace(/\D/g, '');
  const local = d.startsWith('972') ? d.slice(3) : d.replace(/^0/, '');
  return /^5\d{8}$/.test(local) ? `972${local}` : null;
}

type Field = 'company' | 'name' | 'phone';
const dotted = 'whitespace-nowrap underline decoration-dotted underline-offset-4';

/** Marketing company · contact person · contact phone, each click-to-edit (Super Admin only). */
export function MarketingContactLine({ ownerId, devName, contact }: { ownerId: string; devName: string; contact?: MarketingContact | null }) {
  const qc = useQueryClient();
  const [field, setField] = useState<Field | null>(null);
  const [value, setValue] = useState('');
  const companyId = contact?.company_id ?? null;
  const save = useMutation({
    mutationFn: async (patch: { name?: string; contact_name?: string | null; contact_phone?: string | null; contact_gender?: string | null }) => {
      const { error } = await supabase.from('marketing_companies').update(patch).eq('id', companyId!);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('נשמר'); setField(null); void qc.invalidateQueries({ queryKey: ['marketing-contacts'] }); },
    onError: (e: { code?: string }) => toast.error(e?.code === '23505' ? 'חברה בשם זה כבר קיימת' : 'השמירה נכשלה'),
  });
  const start = (f: Field) => { setField(f); setValue(f === 'company' ? contact?.company_name ?? '' : f === 'name' ? contact?.contact_name ?? '' : contact?.contact_phone ? formatPhoneDisplay(contact.contact_phone) : ''); };
  const commit = () => {
    const v = value.trim();
    if (field === 'company') { if (v.length < 2) return toast.error('שם החברה קצר מדי'); save.mutate({ name: v }); }
    else if (field === 'name') save.mutate({ contact_name: v || null });
    else if (field === 'phone') { if (!v) return save.mutate({ contact_phone: null }); const p = toIntlMobile(v); if (!p) return toast.error('יש להזין נייד ישראלי תקין'); save.mutate({ contact_phone: p }); }
  };
  if (!companyId) return <MarketingCompanyLine ownerId={ownerId} name={devName} label={null} />;
  if (field) return <div className="flex items-center gap-1">
    <Input autoFocus aria-label={field === 'company' ? 'שם חברת השיווק' : field === 'name' ? 'שם איש הקשר' : 'טלפון איש הקשר'} className="h-8 min-w-0 flex-1 px-2 text-sm sm:text-base" dir={field === 'phone' ? 'ltr' : 'rtl'} inputMode={field === 'phone' ? 'tel' : undefined} placeholder={field === 'phone' ? '05X-XXXXXXX' : ''} value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setField(null); }} />
    {field === 'name' && <div role="radiogroup" aria-label="מגדר איש הקשר" className="flex">
      {([['male', 'זכר', '♂'], ['female', 'נקבה', '♀']] as const).map(([g, label, icon]) => <Button key={g} type="button" size="icon" variant={contact?.contact_gender === g ? 'secondary' : 'ghost'} role="radio" aria-checked={contact?.contact_gender === g} aria-label={label} title={label} className="h-8 w-8 text-base" disabled={save.isPending} onClick={() => save.mutate({ contact_gender: g, ...(value.trim() ? { contact_name: value.trim() } : {}) })}>{icon}</Button>)}
    </div>}
    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="שמירה" disabled={save.isPending} onClick={commit}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</Button>
    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="ביטול" onClick={() => setField(null)}><X className="h-4 w-4" /></Button>
  </div>;
  return <div className="flex min-w-0 items-center gap-2 overflow-hidden text-sm text-muted-foreground sm:text-base">
    <button type="button" className={`${dotted} min-w-0 truncate`} onClick={() => start('company')} aria-label="עריכת שם חברת השיווק">{contact?.company_name}</button>
    <span aria-hidden>·</span>
    <button type="button" className={`${dotted} ${contact?.contact_name ? '' : 'text-primary'}`} onClick={() => start('name')} aria-label="עריכת איש הקשר">{contact?.contact_name || 'איש קשר'}{contact?.contact_gender && <span className="mr-1" aria-label={contact.contact_gender === 'female' ? 'נקבה' : 'זכר'}>{contact.contact_gender === 'female' ? '♀' : '♂'}</span>}</button>
    <span aria-hidden>·</span>
    <button type="button" dir={contact?.contact_phone ? 'ltr' : 'rtl'} className={`${dotted} ${contact?.contact_phone ? '' : 'text-primary'}`} onClick={() => start('phone')} aria-label="עריכת טלפון איש הקשר">{contact?.contact_phone ? formatPhoneDisplay(contact.contact_phone) : 'טלפון איש קשר'}</button>
    <MarketingCompanyLine ownerId={ownerId} name={devName} label={null} iconOnly />
  </div>;
}
