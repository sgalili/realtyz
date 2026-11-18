import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Row = { id: string; name: string | null; marketing_company_id: string | null };
type Overview = { companies: { id: string; name: string }[]; developers: Row[]; projects: Row[] };
const NONE = '__none__';

/** Super Admin-only marketing-company assignment for one developer workspace. */
export function MarketingCompanyLine({ ownerId, name, label, iconOnly, plain }: { ownerId: string; name: string; label?: string | null; iconOnly?: boolean; plain?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const key = ['marketing-overview', ownerId];
  const ov = useQuery({ queryKey: key, enabled: open, queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_marketing_overview', { _owner: ownerId });
    if (error) throw error; return data as unknown as Overview;
  } });
  const refresh = () => { void qc.invalidateQueries({ queryKey: key }); void qc.invalidateQueries({ queryKey: ['marketing-summaries'] }); void qc.invalidateQueries({ queryKey: ['marketing-contacts'] }); };
  const assign = useMutation({
    mutationFn: async (v: { kind: 'developer' | 'project'; id: string; company: string | null }) => {
      const { error } = await supabase.rpc('admin_assign_marketing_company', { _kind: v.kind, _id: v.id, _company: v.company as string });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('השיוך עודכן'); refresh(); },
    onError: () => toast.error('עדכון השיוך נכשל'),
  });
  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from('marketing_companies').insert({ name: newName.trim(), created_by: u.user?.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('חברת השיווק נוספה'); setNewName(''); refresh(); },
    onError: (e: { code?: string }) => toast.error(e?.code === '23505' ? 'חברה בשם זה כבר קיימת' : 'הוספת החברה נכשלה'),
  });
  const companies = ov.data?.companies ?? [];
  const picker = (kind: 'developer' | 'project', r: Row) => (
    <Select value={r.marketing_company_id ?? NONE} disabled={assign.isPending} onValueChange={v => assign.mutate({ kind, id: r.id, company: v === NONE ? null : v })}>
      <SelectTrigger className="h-10 w-full text-base sm:w-56"><SelectValue /></SelectTrigger>
      <SelectContent dir="rtl"><SelectItem value={NONE}>ללא חברת שיווק</SelectItem>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
    </Select>
  );
  return <>
    {iconOnly ? <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="שיוך או העברה לחברת שיווק" title="שיוך לחברת שיווק" onClick={() => setOpen(true)}><Building2 className="h-4 w-4" /></Button> : <button type="button" onClick={() => setOpen(true)} className={`flex min-w-0 items-center gap-1 truncate text-sm underline decoration-dotted underline-offset-4 sm:text-base ${label ? 'text-muted-foreground' : 'text-primary'}`}>
      {!plain && <Building2 className="h-3.5 w-3.5 shrink-0" />}{label ? <span className="truncate">{plain ? label : `חברת שיווק: ${label}`}</span> : 'חברת שיווק'}
    </button>}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dir="rtl" className="w-[calc(100%-2rem)] max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto text-right">
        <DialogHeader><DialogTitle>חברת שיווק · {name || 'יזם'}</DialogTitle><DialogDescription>שיוך והעברת היזם והפרויקטים בין חברות שיווק.</DialogDescription></DialogHeader>
        <div className="flex gap-2">
          <Input className="h-11 text-base" placeholder="שם חברת שיווק חדשה" value={newName} onChange={e => setNewName(e.target.value)} />
          <Button variant="outline" className="h-11" disabled={newName.trim().length < 2 || create.isPending} onClick={() => create.mutate()}>{create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}הוספה</Button>
        </div>
        {ov.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : ov.isError ? <p role="alert" className="text-destructive">טעינת הנתונים נכשלה</p> : <div className="space-y-4">
          {(ov.data?.developers ?? []).map(d => <div key={d.id} className="space-y-1"><p className="font-semibold">יזם: {d.name || name}</p>{picker('developer', d)}</div>)}
          {(ov.data?.projects ?? []).length > 0 && <div className="space-y-2"><p className="font-semibold">פרויקטים</p>
            {ov.data!.projects.map(p => <div key={p.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><span className="truncate">{p.name || 'פרויקט'}</span>{picker('project', p)}</div>)}</div>}
          {!ov.data?.developers.length && !ov.data?.projects.length && <p className="text-muted-foreground">אין יזם או פרויקטים לשיוך בחשבון זה.</p>}
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}
