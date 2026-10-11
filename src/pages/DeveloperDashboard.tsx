import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ExternalLink, FileDown, Loader2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import DeveloperYad2Import from '@/components/developers/DeveloperYad2Import';
import DeveloperProjectWizard from '@/components/developers/DeveloperProjectWizard';
import { PROJECT_STATUS, type DeveloperProject } from '@/lib/developerProjectForm';

type Mode = 'choose' | 'import' | 'manual' | null;
export default function DeveloperDashboard() {
  const { activeWorkspaceId: ws } = useWorkspace();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const onboarding = params.get('onboarding') === '1';
  const [mode, setMode] = useState<Mode>(() => params.get('import') === '1' || onboarding ? 'import' : null);
  const [editing, setEditing] = useState<DeveloperProject | undefined>();
  useEffect(() => {
    if (params.get('import') === '1' || params.get('onboarding') === '1') setMode('import');
  }, [params]);
  useEffect(() => {
    const add = () => { setEditing(undefined); setMode('choose'); };
    window.addEventListener('developer-projects:add', add);
    return () => window.removeEventListener('developer-projects:add', add);
  }, []);
  useEffect(() => { setEditing(undefined); }, [ws]);
  const { data: companies = [], isLoading: companiesLoading, error: companyError } = useQuery({
    queryKey: ['my-developer', ws], enabled: !!ws, refetchOnMount: 'always',
    queryFn: async () => {
      if (!ws) return [];
      const { data, error } = await supabase.from('developers').select('*').eq('workspace_owner_id', ws).order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: projects = [], isLoading, error: projectError } = useQuery({
    queryKey: ['developer-projects', ws], enabled: !!ws, refetchOnMount: 'always',
    queryFn: async () => {
      if (!ws) return [];
      const { data, error } = await supabase.from('developer_projects').select('*').eq('workspace_owner_id', ws).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const developer = editing ? companies.find(company => company.id === editing.developer_id) : companies[0];
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['my-developer', ws] }); void qc.invalidateQueries({ queryKey: ['developer-projects', ws] }); };
  const close = () => {
    setMode(null); setEditing(undefined);
    if (params.has('import') || params.has('onboarding')) navigate('/developer-dashboard', { replace: true });
  };
  const saved = () => {
    refresh(); close();
    if (onboarding) navigate('/profile?welcome=developer', { replace: true });
  };
  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!ws) throw new Error('יש לבחור סביבת עבודה');
      const { data, error } = await supabase.from('developer_projects').delete().eq('id', id).eq('workspace_owner_id', ws).select('id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { refresh(); toast.success('הפרויקט נמחק'); },
    onError: () => toast.error('מחיקת הפרויקט נכשלה'),
  });
  const busy = !ws || isLoading || companiesLoading;
  return (
    <div dir="rtl" className="mx-auto max-w-6xl space-y-6 p-4">
      {busy ? <div role="status" className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /><span className="sr-only">טוען פרויקטים</span></div>
      : projectError || companyError ? <div role="alert" className="space-y-3 py-8 text-center"><p className="text-lg text-destructive">לא ניתן לטעון את הפרויקטים</p><Button variant="outline" onClick={refresh}>ניסיון נוסף</Button></div>
      : projects.length === 0 ? <section className="flex flex-col items-center gap-3 py-16 text-center"><Building2 className="h-12 w-12 text-muted-foreground/50" /><h2 className="text-xl font-semibold">עדיין אין פרויקטים</h2></section>
      : <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {companies[0]?.logo_url && <img src={companies[0].logo_url} alt="לוגו החברה" className="h-12 w-12 rounded object-contain" />}
            <span className="truncate text-lg font-semibold">{companies[0]?.company_name}</span>
          </div>
          <Button variant="ghost" onClick={() => setMode('import')}><FileDown className="h-4 w-4" />סנכרון מיד2</Button>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 border-b border-border pb-4">
          {[['פרויקטים', projects.length], ['יח״ד', projects.reduce((s, p) => s + (p.total_units ?? 0), 0)], ['זמינות', projects.reduce((s, p) => s + (p.available_units ?? 0), 0)]].filter(([, v]) => Number(v) > 0).map(([l, v]) => <div key={l} className="flex items-baseline gap-2"><strong className="text-xl">{Number(v).toLocaleString('he-IL')}</strong><span className="text-base text-muted-foreground">{l}</span></div>)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map(p => <article key={p.id} className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
            {p.image_url ? <img src={p.image_url} alt={p.name} className="h-44 w-full object-cover" /> : <div className="flex h-44 items-center justify-center bg-muted"><Building2 className="h-12 w-12 text-muted-foreground/40" /></div>}
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2"><h3 className="min-w-0 break-words text-xl font-bold">{p.name}</h3><span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-sm text-primary">{PROJECT_STATUS[p.status] ?? p.status}</span></div>
              <p className="text-base text-muted-foreground">{[p.city, p.neighborhood, p.address].filter(Boolean).join(' · ')}</p>
              <div className="flex flex-wrap gap-3 text-base">{!!p.total_units && <span>{p.total_units} יח״ד</span>}{!!p.available_units && <span>{p.available_units} זמינות</span>}{!!p.price_from && <strong>החל מ־₪{Number(p.price_from).toLocaleString('he-IL')}</strong>}</div>
              <div className="mt-auto flex items-center gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => { setEditing(p); setMode('manual'); }}><Pencil />עריכה</Button>
                {p.source_url && <Button asChild size="icon-sm" variant="ghost"><a href={p.source_url} target="_blank" rel="noopener noreferrer" aria-label="עמוד הפרויקט ביד2" title="עמוד הפרויקט ביד2"><ExternalLink /></a></Button>}
                <Button size="icon-sm" variant="ghost" disabled={remove.isPending} title="מחיקת פרויקט" aria-label="מחיקת פרויקט" onClick={() => { if (confirm('למחוק את הפרויקט?')) remove.mutate(p.id); }}><Trash2 /></Button>
              </div>
            </div>
          </article>)}
        </div>
      </>}
      <Dialog open={mode !== null} onOpenChange={open => { if (!open) close(); }}>
        <DialogContent dir="rtl" className="max-h-[92dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-lg p-4 sm:p-6">
          <DialogHeader><DialogTitle className="text-2xl">{editing ? 'עריכת פרויקט' : mode === 'import' ? 'ייבוא מיד2' : 'יצירת פרויקט'}</DialogTitle><DialogDescription className="sr-only">פרטי החברה והפרויקט</DialogDescription></DialogHeader>
          {mode === 'choose' && <div className="grid gap-3 py-5 sm:grid-cols-2">
            <Button variant="outline" className="h-24 gap-3 text-lg" onClick={() => setMode('import')}><FileDown />ייבוא מיד2</Button>
            <Button variant="outline" className="h-24 gap-3 text-lg" onClick={() => setMode('manual')}><Pencil />יצירה ידנית</Button>
          </div>}
          {mode === 'import' && <div className="space-y-4"><DeveloperYad2Import onSaved={saved} /><Button variant="ghost" onClick={() => setMode('manual')}>יצירה ידנית</Button></div>}
          {mode === 'manual' && !busy && <DeveloperProjectWizard key={`${ws}-${editing?.id ?? 'new'}`} project={editing} company={developer} onSaved={saved} onCancel={close} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
