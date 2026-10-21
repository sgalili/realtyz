import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronDown, ExternalLink, FileDown, Layers, Loader2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import DeveloperYad2Import from '@/components/developers/DeveloperYad2Import';
import DeveloperProjectWizard from '@/components/developers/DeveloperProjectWizard';
import { PROJECT_STATUS, type DeveloperProject } from '@/lib/developerProjectForm';
import BoardSearchControls from '@/components/public/BoardSearchControls';
import LeadTypeFilterButton from '@/components/affiliate/LeadTypeFilterButton';
import PropertyGallerySlider from '@/components/public/PropertyGallerySlider';
import ProjectHierarchyDetails from '@/components/developers/ProjectHierarchyDetails';
import { AnimatedExpansion } from '@/components/ui/animated-expansion';
import { EMPTY_LEAD_FILTER, EMPTY_PROPERTY_FILTER } from '@/lib/leadTypeFilter';
import { projectDeal, projectMatches, savedProjectHierarchy } from '@/lib/developerProjectBoard';
import { cn } from '@/lib/utils';
import { usePublicBoardColumns, BoardColumnDragArea, BoardColumnHeader, BoardColumnMenu, type BoardColumnId } from '@/components/public/PublicBoardTableControls';

const projectImages = (project: DeveloperProject) => [...new Set([...(Array.isArray(project.images) ? project.images.filter((image): image is string => typeof image === 'string') : []), ...(project.image_url ? [project.image_url] : [])])];
const priceLabel = (price: number | null) => price && price > 0 ? `החל מ־₪${Number(price).toLocaleString('he-IL')}` : '';
const PROJECT_COLUMNS = { columns: [{ id: 'photo', label: 'תמונה' }, { id: 'address', label: 'פרויקט' }, { id: 'price', label: 'מחיר' }, { id: 'commissions', label: 'בניינים' }, { id: 'deal', label: 'עסקה' }, { id: 'rooms', label: 'סוגי יחידות' }, { id: 'floor', label: 'סטטוס' }] as { id: BoardColumnId; label: string }[], value: (p: DeveloperProject, id: BoardColumnId) => id === 'price' ? p.price_from : id === 'address' ? p.name : id === 'commissions' ? savedProjectHierarchy(p).buildings.length : id === 'rooms' ? savedProjectHierarchy(p).apartments.length : id === 'floor' ? p.status : id === 'deal' ? projectDeal(p) : projectImages(p).length };

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
  const [query, setQuery] = useState('');
  const [deals, setDeals] = useState({ sale: true, rent: true });
  const [leadFilter, setLeadFilter] = useState(EMPTY_LEAD_FILTER);
  const [propFilter, setPropFilter] = useState(EMPTY_PROPERTY_FILTER);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [grid, setGrid] = useState(() => { try { return localStorage.getItem('developer-projects-view') !== 'list'; } catch { return true; } });
  const toggleGrid = () => setGrid(value => { try { localStorage.setItem('developer-projects-view', value ? 'list' : 'grid'); } catch { /* storage unavailable */ } return !value; });
  const toggleDeal = (key: 'sale' | 'rent') => setDeals(current => { const next = { ...current, [key]: !current[key] }; return next.sale || next.rent ? next : current; });
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
  const filtered = useMemo(() => projects.filter(project => projectMatches(project, query, deals, { ...propFilter, dealType: 'all' })), [projects, query, deals, propFilter]);
  const columns = usePublicBoardColumns(`developer-projects:${ws ?? ''}`, filtered, PROJECT_COLUMNS);
  const cities = useMemo(() => [...new Set(projects.map(project => project.city).filter(Boolean) as string[])].sort(), [projects]);
  const neighborhoods = useMemo(() => [...new Set(projects.map(project => project.neighborhood).filter(Boolean) as string[])].sort(), [projects]);
  const propertyTypes = useMemo(() => [...new Set(projects.flatMap(project => savedProjectHierarchy(project).apartments.map(unit => unit.type)).filter((type): type is string => typeof type === 'string' && !!type))].sort(), [projects]);
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
  const actions = (p: DeveloperProject) => <div className="flex items-center gap-1" onClick={event => event.stopPropagation()}>
    <Button size="icon-sm" variant="ghost" aria-label="עריכת פרויקט" title="עריכת פרויקט" onClick={() => { setEditing(p); setMode('manual'); }}><Pencil /></Button>
    {p.source_url && <Button asChild size="icon-sm" variant="ghost"><a href={p.source_url} target="_blank" rel="noopener noreferrer" aria-label="עמוד הפרויקט ביד2" title="עמוד הפרויקט ביד2"><ExternalLink /></a></Button>}
    <Button size="icon-sm" variant="ghost" className="text-destructive" disabled={remove.isPending} title="מחיקת פרויקט" aria-label="מחיקת פרויקט" onClick={() => { if (confirm('למחוק את הפרויקט?')) remove.mutate(p.id); }}><Trash2 /></Button>
  </div>;
  const meta = (p: DeveloperProject) => { const h = savedProjectHierarchy(p); return [h.buildings.length ? `${h.buildings.length} בניינים` : '', h.apartments.length ? `${h.apartments.length} סוגי יחידות` : '', p.available_units ? `${p.available_units} זמינות` : ''].filter(Boolean); };
  return (
    <div dir="rtl" className="mx-auto w-full min-w-0 max-w-6xl space-y-5 p-4">
      {busy ? <div role="status" className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /><span className="sr-only">טוען פרויקטים</span></div>
      : projectError || companyError ? <div role="alert" className="space-y-3 py-8 text-center"><p className="text-lg text-destructive">לא ניתן לטעון את הפרויקטים</p><Button variant="outline" onClick={refresh}>ניסיון נוסף</Button></div>
      : projects.length === 0 ? <section className="flex flex-col items-center gap-3 py-16 text-center"><Building2 className="h-12 w-12 text-muted-foreground/50" /><h2 className="text-xl font-semibold">עדיין אין פרויקטים</h2><p className="text-base text-muted-foreground">ייבוא הפרויקטים מיד2 נשמר אחרי לחיצה על ״אישור ושמירה״.</p><div className="flex gap-2"><Button onClick={() => setMode('import')}><FileDown className="h-4 w-4" />ייבוא מיד2</Button><Button variant="outline" onClick={() => { setEditing(undefined); setMode('manual'); }}><Pencil className="h-4 w-4" />יצירה ידנית</Button></div></section>
      : <>
        <div className="flex items-center gap-3">
          {companies[0]?.logo_url && <img src={companies[0].logo_url} alt="לוגו החברה" className="h-10 w-10 rounded object-contain" />}
          <span className="min-w-0 flex-1 truncate font-semibold">{companies[0]?.company_name}</span>
          <Button variant="ghost" size="sm" onClick={() => setMode('import')}><FileDown className="h-4 w-4" />סנכרון מיד2</Button>
        </div>
        <BoardSearchControls query={query} onQueryChange={setQuery} deals={deals} onDealToggle={toggleDeal} grid={grid} onViewToggle={toggleGrid} filter={<LeadTypeFilterButton state={leadFilter} onChange={setLeadFilter} propertyState={propFilter} onPropertyChange={setPropFilter} cities={cities} neighborhoods={neighborhoods} propertyTypes={propertyTypes} />} />
        {filtered.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">לא נמצאו פרויקטים מתאימים</p> : grid ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(p => { const open = expandedId === p.id; const deal = projectDeal(p); return <article key={p.id} className={cn('flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md', open && 'sm:col-span-2 lg:col-span-3')}>
            <div className="flex items-start gap-2 p-3"><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><h2 className="min-w-0 break-words text-[19px] font-bold leading-snug">{p.name}</h2>{priceLabel(p.price_from) && <p className={cn('shrink-0 whitespace-nowrap text-[17px] font-bold', deal === 'rent' ? 'text-sale' : 'text-success')}>{priceLabel(p.price_from)}</p>}</div><p className="mt-1 truncate text-sm text-muted-foreground">{[p.city, p.neighborhood].filter(Boolean).join(' · ')}</p></div>{actions(p)}</div>
            <PropertyGallerySlider photos={projectImages(p)} alt={p.name} overlay={<span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{PROJECT_STATUS[p.status] ?? p.status}</span>} />
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">{meta(p).map(item => <span key={item} className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5 text-primary" />{item}</span>)}</div>
              <Button variant="outline" className="mt-auto justify-between" aria-expanded={open} onClick={() => setExpandedId(open ? null : p.id)}>בניינים ויחידות<ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} /></Button>
              <AnimatedExpansion open={open}><ProjectHierarchyDetails project={p} /></AnimatedExpansion>
            </div>
          </article>; })}
        </div> : <BoardColumnDragArea controls={columns}><div className="w-full min-w-0 overflow-x-auto rounded-lg border bg-card"><table className="w-max min-w-full text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr>{columns.visible.map(id => <BoardColumnHeader key={id} id={id} controls={columns} />)}<th className="p-2"><BoardColumnMenu controls={columns} /></th></tr></thead><tbody>
          {columns.sorted.flatMap(p => { const open = expandedId === p.id; const deal = projectDeal(p); const hierarchy = savedProjectHierarchy(p); return [<tr key={p.id} tabIndex={0} aria-expanded={open} onClick={() => setExpandedId(open ? null : p.id)} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setExpandedId(open ? null : p.id); } }} className="cursor-pointer border-t hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {columns.visible.map(id => <td key={id} className={cn('p-2', id === 'price' && 'whitespace-nowrap font-bold', id === 'price' && (deal === 'rent' ? 'text-sale' : 'text-success'))}>
              {id === 'photo' ? projectImages(p)[0] ? <img src={projectImages(p)[0]} alt="" className="h-12 w-12 rounded object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded bg-muted"><Building2 className="h-5 w-5 text-muted-foreground" /></div>
              : id === 'address' ? <div className="w-64"><strong className="block truncate">{p.name}</strong><span className="block truncate text-xs text-muted-foreground">{[p.city, p.neighborhood].filter(Boolean).join(' · ')}</span></div>
              : id === 'price' ? priceLabel(p.price_from) : id === 'deal' ? <span className={cn('whitespace-nowrap', deal === 'rent' ? 'text-sale' : 'text-success')}>{deal === 'rent' ? 'להשכרה' : 'למכירה'}</span>
              : id === 'commissions' ? hierarchy.buildings.length || '' : id === 'rooms' ? hierarchy.apartments.length || '' : PROJECT_STATUS[p.status] ?? p.status}
            </td>)}
            <td className="p-2"><div className="flex items-center">{actions(p)}<Button variant="ghost" size="icon-sm" aria-label={`בניינים ויחידות ${p.name}`} aria-expanded={open} onClick={event => { event.stopPropagation(); setExpandedId(open ? null : p.id); }}><ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} /></Button></div></td>
          </tr>, <tr key={`${p.id}-details`}><td colSpan={columns.visible.length + 1} className="p-0"><AnimatedExpansion open={open}><div className="sticky right-0 max-w-[calc(100vw-2rem)] space-y-4 p-4"><PropertyGallerySlider photos={projectImages(p)} alt={p.name} /><ProjectHierarchyDetails project={p} /></div></AnimatedExpansion></td></tr>]; })}
        </tbody></table></div></BoardColumnDragArea>}
      </>}
      <Dialog open={mode !== null} onOpenChange={open => { if (!open) close(); }}>
        <DialogContent dir="rtl" className="max-h-[92dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-lg p-4 sm:p-6">
          <DialogHeader><DialogTitle className="text-2xl">{editing ? 'עריכת פרויקט' : mode === 'import' ? 'ייבוא מיד2' : 'יצירת פרויקט'}</DialogTitle><DialogDescription className="sr-only">פרטי החברה והפרויקט</DialogDescription></DialogHeader>
          {mode === 'choose' && <div className="grid gap-3 py-5 sm:grid-cols-2">
            <Button variant="outline" className="h-24 gap-3 text-lg" onClick={() => setMode('import')}><FileDown />ייבוא מיד2</Button>
            <Button variant="outline" className="h-24 gap-3 text-lg" onClick={() => setMode('manual')}><Pencil />יצירה ידנית</Button>
          </div>}
          {mode === 'import' && <div className="space-y-4"><DeveloperYad2Import onSaved={saved} initialUrl={companies[0]?.source_url ?? null} /><Button variant="ghost" onClick={() => setMode('manual')}>יצירה ידנית</Button></div>}
          {mode === 'manual' && !busy && <DeveloperProjectWizard key={`${ws}-${editing?.id ?? 'new'}`} project={editing} company={developer} onSaved={saved} onCancel={close} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
