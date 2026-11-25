import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PROJECT_STATUS } from '@/lib/developerProjectForm';

/** True only for the owner of a real (non-demo) marketing agency; demos stay view-only. */
export function useOwnsMarketingCompany() {
  return useQuery({ queryKey: ['owned-marketing-company'], queryFn: async () => {
    const { data, error } = await supabase.rpc('owned_marketing_company_id');
    if (error) throw error; return !!data;
  } }).data === true;
}

type Field = { key: string; label: string; type?: string; options?: Record<string, string> };
const friendly = (message: string) => ({ invalid_details: 'יש להשלים את כל השדות הנדרשים.', client_not_found: 'היזם לא נמצא בחשבון שלכם.', project_not_found: 'הפרויקט לא נמצא בחשבון שלכם.' } as Record<string, string>)[message] ?? 'לא ניתן לשמור כרגע. אפשר לנסות שוב.';

function AddDialog({ label, title, fields, required, onSave }: { label: string; title: string; fields: Field[]; required: string[]; onSave: (v: Record<string, string>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const ready = required.every(k => (values[k] ?? '').trim());
  const save = async () => {
    setBusy(true);
    try { await onSave(values); toast.success('נשמר בהצלחה.'); setValues({}); setOpen(false); }
    catch (e) { toast.error(friendly(e instanceof Error ? e.message : '')); }
    finally { setBusy(false); }
  };
  return <>
    <Button type="button" variant="outline" className="gap-2" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{label}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="max-w-md">
      <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      <div className="space-y-3">{fields.map(f => f.options
        ? <select key={f.key} aria-label={f.label} className="h-11 w-full rounded-md border border-input bg-background px-3" value={values[f.key] ?? Object.keys(f.options)[0]} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}>{Object.entries(f.options).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        : <Input key={f.key} aria-label={f.label} placeholder={f.label} type={f.type ?? 'text'} min={f.type === 'number' ? 0 : undefined} maxLength={200} value={values[f.key] ?? ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} />)}
      </div>
      <div className="flex justify-between gap-3 pt-2"><Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button><Button disabled={!ready || busy} onClick={() => void save()}>{busy ? 'שומר...' : 'שמירה'}</Button></div>
    </DialogContent></Dialog>
  </>;
}

const rpcOrThrow = async (fn: string, args: Record<string, unknown>) => {
  const { error } = await (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)(fn, args);
  if (error) throw new Error(error.message);
};

export function AddClientButton() {
  const qc = useQueryClient();
  return <AddDialog label="הוספת יזם" title="יזם חדש בחשבון" required={['name']} fields={[{ key: 'name', label: 'שם חברת היזם *' }, { key: 'contact', label: 'איש קשר' }, { key: 'phone', label: 'טלפון', type: 'tel' }]}
    onSave={async v => { await rpcOrThrow('marketing_add_client', { _name: v.name, _contact_name: v.contact ?? null, _contact_phone: v.phone ?? null }); await qc.invalidateQueries({ queryKey: ['marketing-clients'] }); }} />;
}

export function AddProjectButton({ developerId }: { developerId: string }) {
  const qc = useQueryClient();
  return <AddDialog label="הוספת פרויקט" title="פרויקט חדש" required={['name']} fields={[{ key: 'name', label: 'שם הפרויקט *' }, { key: 'city', label: 'עיר' }, { key: 'status', label: 'סטטוס', options: PROJECT_STATUS }]}
    onSave={async v => { await rpcOrThrow('marketing_add_project', { _developer: developerId, _name: v.name, _city: v.city ?? null, _status: v.status ?? 'pre_sale' }); await Promise.all([qc.invalidateQueries({ queryKey: ['marketing-client-projects', developerId] }), qc.invalidateQueries({ queryKey: ['marketing-clients'] })]); }} />;
}

export function AddUnitButton({ projectId, developerId }: { projectId: string; developerId: string }) {
  const qc = useQueryClient();
  return <AddDialog label="הוספת דירות" title="סוג דירה חדש בפרויקט" required={['type', 'count']} fields={[{ key: 'type', label: 'סוג הדירה *' }, { key: 'rooms', label: 'חדרים', type: 'number' }, { key: 'size', label: 'שטח במ״ר', type: 'number' }, { key: 'price', label: 'מחיר', type: 'number' }, { key: 'count', label: 'כמות דירות *', type: 'number' }]}
    onSave={async v => { await rpcOrThrow('marketing_add_unit', { _project: projectId, _type: v.type, _rooms: Number(v.rooms) || 0, _size_sqm: Number(v.size) || 0, _price: Number(v.price) || 0, _count: Math.round(Number(v.count)) }); await Promise.all([qc.invalidateQueries({ queryKey: ['marketing-client-projects', developerId] }), qc.invalidateQueries({ queryKey: ['marketing-clients'] })]); }} />;
}
