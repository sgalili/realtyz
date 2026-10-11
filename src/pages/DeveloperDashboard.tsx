import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DeveloperYad2Import from '@/components/developers/DeveloperYad2Import';

type Project = {
  id: string; developer_id: string; name: string; city: string | null; neighborhood: string | null; address: string | null;
  status: string; total_units: number | null; available_units: number | null; price_from: number | null;
  delivery_date: string | null; description: string | null; image_url: string | null; source_url: string | null;
  apartments: unknown;
};
const STATUS: Record<string, string> = { pre_sale: 'טרום שיווק', marketing: 'בשיווק', construction: 'בבנייה', sold_out: 'אזל', delivered: 'נמסר' };
const EMPTY = { name: '', city: '', neighborhood: '', address: '', status: 'marketing', total_units: '', available_units: '', price_from: '', delivery_date: '', description: '' };
const n = (v: string) => (v.trim() ? Number(v.replace(/[^\d.]/g, '')) || null : null);

export default function DeveloperDashboard() {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const ws = activeWorkspaceId ?? user?.id ?? null;
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const onboarding = params.get('onboarding') === '1';
  const importSection = useRef<HTMLElement>(null);
  useEffect(() => { if (params.get('import') === '1') importSection.current?.scrollIntoView({ block: 'start' }); }, [params]);
  const [editing, setEditing] = useState<Project | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY);

  const { data: developer } = useQuery({
    queryKey: ['my-developer', ws], enabled: !!ws,
    queryFn: async () => {
      const { data } = await supabase.from('developers').select('*').eq('workspace_owner_id', ws!).order('created_at').limit(1).maybeSingle();
      return data;
    },
  });
  const { data: projects = [] } = useQuery({
    queryKey: ['developer-projects', ws], enabled: !!ws,
    queryFn: async () => {
      const { data, error } = await supabase.from('developer_projects').select('*').eq('workspace_owner_id', ws!).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Project[];
    },
  });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['my-developer', ws] }); void qc.invalidateQueries({ queryKey: ['developer-projects', ws] }); };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('שם הפרויקט חובה');
      let devId = developer?.id as string | undefined;
      if (!devId) {
        const { data, error } = await supabase.from('developers').insert({ workspace_owner_id: ws!, owner_user_id: user!.id, company_name: 'החברה שלי' }).select('id').single();
        if (error) throw error;
        devId = data.id;
      }
      const row = {
        name: form.name.trim(), city: form.city.trim() || null, neighborhood: form.neighborhood.trim() || null, address: form.address.trim() || null,
        status: form.status, total_units: n(form.total_units), available_units: n(form.available_units), price_from: n(form.price_from),
        delivery_date: form.delivery_date.trim() || null, description: form.description.trim() || null,
      };
      const { error } = editing && editing !== 'new'
        ? await supabase.from('developer_projects').update(row).eq('id', editing.id)
        : await supabase.from('developer_projects').insert({ ...row, workspace_owner_id: ws!, developer_id: devId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('הפרויקט נשמר'); setEditing(null); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? 'השמירה נכשלה'),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('developer_projects').delete().eq('id', id); if (error) throw error; },
    onSuccess: refresh,
  });

  const open = (p: Project | 'new') => {
    setEditing(p);
    setForm(p === 'new' ? EMPTY : {
      name: p.name, city: p.city ?? '', neighborhood: p.neighborhood ?? '', address: p.address ?? '', status: p.status,
      total_units: p.total_units?.toString() ?? '', available_units: p.available_units?.toString() ?? '',
      price_from: p.price_from?.toString() ?? '', delivery_date: p.delivery_date ?? '', description: p.description ?? '',
    });
  };
  const totalUnits = projects.reduce((s, p) => s + (p.total_units ?? 0), 0);
  const available = projects.reduce((s, p) => s + (p.available_units ?? 0), 0);

  return (
    <div dir="rtl" className="mx-auto max-w-6xl space-y-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {developer?.logo_url && <img src={developer.logo_url} alt="" className="h-12 w-12 rounded object-contain" />}
          <div>
            <h1 className="text-2xl font-bold">{developer?.company_name ?? 'הפרויקטים שלי'}</h1>
            {developer?.source_url && <a href={developer.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary">עמוד היזם ביד2 <ExternalLink className="h-3 w-3" /></a>}
          </div>
        </div>
        <Button onClick={() => open('new')}><Plus className="h-4 w-4" />פרויקט חדש</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[['פרויקטים', projects.length], ['יח״ד', totalUnits], ['זמינות', available]].map(([l, v]) => (
          <div key={l as string} className="rounded-lg border bg-card p-4 text-center">
            <div className="text-2xl font-bold">{(v as number) > 0 ? (v as number).toLocaleString('he-IL') : '—'}</div>
            <div className="text-sm text-muted-foreground">{l}</div>
          </div>
        ))}
      </div>

      <section ref={importSection} className={`scroll-mt-20 p-4 ${onboarding ? 'order-first border-primary' : ''}`}>
        <h2 className="mb-3 font-bold">{developer?.source_url ? 'סנכרון מחדש מיד2' : 'ייבוא הפרויקטים שלך מיד2'}</h2>
        {onboarding && <p className="mb-3 text-sm text-muted-foreground">החשבון אומת. נשאר רק לייבא את הפרויקטים שלך מיד2.</p>}
        <DeveloperYad2Import onSaved={() => { refresh(); if (onboarding) navigate('/profile?welcome=developer', { replace: true }); }} />
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => {
          const apts = Array.isArray(p.apartments) ? p.apartments.length : 0;
          return (
            <article key={p.id} className="overflow-hidden rounded-lg border bg-card">
              {p.image_url ? <img src={p.image_url} alt={p.name} className="h-40 w-full object-cover" /> : <div className="h-40 w-full bg-muted" />}
              <div className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate font-bold">{p.name}</h3>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{STATUS[p.status] ?? p.status}</span>
                </div>
                <p className="truncate text-sm text-muted-foreground">{[p.city, p.neighborhood, p.address].filter(Boolean).join(' · ')}</p>
                <div className="flex flex-wrap gap-3 text-sm">
                  {!!p.total_units && <span>{p.total_units} יח״ד</span>}
                  {!!p.available_units && <span>{p.available_units} זמינות</span>}
                  {apts > 0 && <span>{apts} דירות</span>}
                  {!!p.price_from && <span className="font-bold">החל מ-₪{Number(p.price_from).toLocaleString('he-IL')}</span>}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => open(p)}><Pencil className="h-4 w-4" />עריכה</Button>
                  <Button size="sm" variant="ghost" aria-label="מחיקה" onClick={() => { if (confirm('למחוק את הפרויקט?')) remove.mutate(p.id); }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing === 'new' ? 'פרויקט חדש' : 'עריכת פרויקט'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {([['name', 'שם הפרויקט'], ['city', 'עיר'], ['neighborhood', 'שכונה'], ['address', 'כתובת'], ['total_units', 'סך יחידות דיור'], ['available_units', 'יחידות זמינות'], ['price_from', 'מחיר החל מ-'], ['delivery_date', 'מועד מסירה']] as const).map(([k, l]) => (
              <div key={k} className={k === 'name' ? 'col-span-2 space-y-1' : 'space-y-1'}>
                <Label htmlFor={`p-${k}`}>{l}</Label>
                <Input id={`p-${k}`} value={form[k]} inputMode={['total_units', 'available_units', 'price_from'].includes(k) ? 'numeric' : undefined} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </div>
            ))}
            <div className="col-span-2 space-y-1">
              <Label>סטטוס</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor="p-desc">תיאור</Label>
              <Textarea id="p-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>שמירה</Button>
            <Button variant="outline" onClick={() => setEditing(null)}>ביטול</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
