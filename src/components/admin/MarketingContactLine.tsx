import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Phone, X } from 'lucide-react';
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
  const [phoneValue, setPhoneValue] = useState('');
  const companyId = contact?.company_id ?? null;
  const save = useMutation({
    mutationFn: async (patch: { name?: string; contact_name?: string | null; contact_phone?: string | null; contact_gender?: string | null }) => {
      const { error } = await supabase.from('marketing_companies').update(patch).eq('id', companyId!);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('נשמר'); setField(null); void qc.invalidateQueries({ queryKey: ['marketing-contacts'] }); },
    onError: (e: { code?: string }) => toast.error(e?.code === '23505' ? 'חברה בשם זה כבר קיימת' : 'השמירה נכשלה'),
  });
  const needCompany = () => { toast.error('יש לבחור חברת שיווק תחילה כדי לשמור את פרטי איש הקשר'); return true; };
  const start = (f: Field) => { if (!companyId && needCompany()) return; setField(f); setValue(f === 'company' ? contact?.company_name ?? '' : f === 'name' ? contact?.contact_name ?? '' : contact?.contact_phone ? formatPhoneDisplay(contact.contact_phone) : ''); setPhoneValue(contact?.contact_phone ? formatPhoneDisplay(contact.contact_phone) : ''); };
  const commit = () => {
    const v = value.trim();
    if (field === 'company') { if (v.length < 2) return toast.error('שם החברה קצר מדי'); save.mutate({ name: v }); }
    else if (field === 'name') { const pv = phoneValue.trim(); const p = pv ? toIntlMobile(pv) : null; if (pv && !p) return toast.error('יש להזין נייד ישראלי תקין'); save.mutate({ contact_name: v || null, contact_phone: p }); }
    else if (field === 'phone') { if (!v) return save.mutate({ contact_phone: null }); const p = toIntlMobile(v); if (!p) return toast.error('יש להזין נייד ישראלי תקין'); save.mutate({ contact_phone: p }); }
  };
  if (field) return <div className="flex items-center gap-1">
    <Input autoFocus aria-label={field === 'company' ? 'שם חברת השיווק' : field === 'phone' ? 'נייד איש הקשר' : 'שם איש הקשר'} dir={field === 'phone' ? 'ltr' : undefined} placeholder={field === 'phone' ? '05X-XXXXXXX' : undefined} className="h-8 min-w-0 flex-1 px-2 text-sm sm:text-base" value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setField(null); }} />
    {field === 'name' && <>
      <Input aria-label="טלפון איש הקשר" className="h-8 w-32 px-2 text-sm sm:text-base" dir="ltr" inputMode="tel" placeholder="05X-XXXXXXX" value={phoneValue} onChange={e => setPhoneValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setField(null); }} />
      <div role="radiogroup" aria-label="מגדר איש הקשר" className="flex">
        {([['male', 'גבר', '♂'], ['female', 'אישה', '♀']] as const).map(([g, label, icon]) => <Button key={g} type="button" size="icon" variant={contact?.contact_gender === g ? 'secondary' : 'ghost'} role="radio" aria-checked={contact?.contact_gender === g} aria-label={label} title={label} className="h-8 w-8 text-base" disabled={save.isPending} onClick={() => save.mutate({ contact_gender: g, ...(value.trim() ? { contact_name: value.trim() } : {}) })}>{icon}</Button>)}
      </div></>}
    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="שמירה" disabled={save.isPending} onClick={commit}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</Button>
    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="ביטול" onClick={() => setField(null)}><X className="h-4 w-4" /></Button>
  </div>;
  const setGender = (g: 'male' | 'female') => { if (!companyId && needCompany()) return; save.mutate({ contact_gender: g }); };
  const phone = contact?.contact_phone ?? null;
  // Marketing company · contact · gender · contact mobile + quick-dial. Always rendered, even when empty.
  return <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground sm:text-base">
    <MarketingCompanyLine ownerId={ownerId} name={devName} label={contact?.company_name ?? null} plain />
    <span aria-hidden>·</span>
    <button type="button" className={`${dotted} min-w-0 truncate ${contact?.contact_name ? '' : 'text-primary'}`} onClick={() => start('name')} aria-label="עריכת איש הקשר">{contact?.contact_name || 'הוסף איש קשר'}</button>
    <div role="radiogroup" aria-label="מגדר איש הקשר" className="flex">
      {([['male', 'זכר', '♂'], ['female', 'נקבה', '♀']] as const).map(([g, label, icon]) => <Button key={g} type="button" size="icon" variant={contact?.contact_gender === g ? 'secondary' : 'ghost'} role="radio" aria-checked={contact?.contact_gender === g} aria-label={label} title={label} className="h-7 w-7 text-base" disabled={save.isPending} onClick={() => setGender(g)}>{icon}</Button>)}
    </div>
    <span className="inline-flex shrink-0 items-center gap-1"><button type="button" dir="ltr" className={`${dotted} ${phone ? '' : 'text-primary'}`} onClick={() => start('phone')} aria-label="עריכת נייד איש הקשר">{phone ? formatPhoneDisplay(phone) : 'הוסף טלפון'}</button>
    {phone && <a href={`tel:+${phone}`} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-primary hover:bg-accent" aria-label={`חיוג לאיש הקשר ${formatPhoneDisplay(phone)}`} title={formatPhoneDisplay(phone)}><Phone className="h-4 w-4" /></a>}</span>
  </div>;
}
