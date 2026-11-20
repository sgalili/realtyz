import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { FullPageLoading } from '@/components/ui/full-page-loading';
import { PublicIdentityLink } from '@/components/community/PublicIdentityLink';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronDown, ExternalLink, FileDown, Layers, Loader2, Pencil, Trash2, Megaphone, Globe, Settings2, LayoutGrid, List } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Button } from '@/components/ui/button';
import { FixedTablePanel, HorizontalTableScroll } from '@/components/ui/horizontal-table-scroll';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import DeveloperYad2Import from '@/components/developers/DeveloperYad2Import';
import DeveloperProjectWizard from '@/components/developers/DeveloperProjectWizard';
import { PROJECT_STATUS, type DeveloperProject } from '@/lib/developerProjectForm';
import BoardSearchControls from '@/components/public/BoardSearchControls';
import LeadTypeFilterButton from '@/components/affiliate/LeadTypeFilterButton';
import PropertyGallerySlider from '@/components/public/PropertyGallerySlider';
import ProjectTimelineBar from '@/components/developers/ProjectTimelineBar';
import ProjectHierarchyDetails from '@/components/developers/ProjectHierarchyDetails';
import { AnimatedExpansion } from '@/components/ui/animated-expansion';
import { EMPTY_LEAD_FILTER, EMPTY_PROPERTY_FILTER } from '@/lib/leadTypeFilter';
import { developerProjectImages, projectDeal, projectMatches, savedProjectHierarchy } from '@/lib/developerProjectBoard';
import { cn } from '@/lib/utils';
import { missingProjectDetails, projectPublicationLabel } from '@/lib/developerProjectCompleteness';

function ProjectStatusCell({ project, hasImages, stage }: { project: DeveloperProject; hasImages: boolean; stage: string }) {
  const label = projectPublicationLabel(project);
  const missing = missingProjectDetails(project as never, hasImages);
  return <span className="flex min-w-[7rem] flex-col items-start gap-1 whitespace-normal leading-tight">
    <span className="flex flex-wrap items-center gap-1"><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', label === 'מפורסם' ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground')}>{label}</span><span className="text-[11px] text-muted-foreground">{stage}</span></span>
    {missing.length ? <span className="text-[11px] text-destructive">חסר: {missing.join(', ')}</span> : label !== 'מפורסם' ? <span className="text-[11px] text-success">מוכן לפרסום</span> : null}
  </span>;
}
import DeveloperCommissionBadges from '@/components/developers/DeveloperCommissionBadges';
import { commissionConfig, developerFeesErrors, projectCommissionErrors, unitCommissionKey, type DeveloperCommissionConfig } from '@/lib/developerCommissions';
import { commissionForSelection, projectUnitSelectionKey, withoutSelectedUnits } from '@/lib/developerProjectSelection';
import DeveloperCommissionEditor from '@/components/developers/DeveloperCommissionEditor';
import { projectCampaignTargets } from '../../supabase/functions/_shared/projectCampaignTargets';
import type { Json } from '@/integrations/supabase/types';
import { usePublicBoardColumns, BoardColumnDragArea, BoardColumnHeader, BoardColumnMenu, type BoardColumnId } from '@/components/public/PublicBoardTableControls';
import { DeveloperLogo } from '@/components/developers/DeveloperLogo';
import { SelectBox, SelectModeToggle } from '@/components/ui/multi-select-controls';
import { useDeveloperSubscription } from '@/hooks/useDeveloperSubscription';
import { Images } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import { useDemoViewStatus } from '@/components/demo/DemoViewBar';
import { canRotateFirstTwoPhotos } from '@/lib/photoRotation';

const projectImages = developerProjectImages;
const priceLabel = (price: number | null) => price && price > 0 ? `החל מ־₪${Number(price).toLocaleString('he-IL')}` : '';
const PROJECT_COLUMNS = { columns: [{ id: 'photo', label: 'תמונה' }, { id: 'address', label: 'פרויקט' }, { id: 'price', label: 'מחיר' }, { id: 'commissions', label: 'תגמולים' }, { id: 'rooms', label: 'סוגי יחידות' }, { id: 'floor', label: 'סטטוס' }] as { id: BoardColumnId; label: string }[], value: (p: DeveloperProject, id: BoardColumnId) => id === 'price' ? p.price_from : id === 'address' ? p.name : id === 'commissions' ? savedProjectHierarchy(p).buildings.length : id === 'rooms' ? savedProjectHierarchy(p).apartments.length : id === 'floor' ? (p as DeveloperProject & { source_status?: string | null }).source_status ?? p.status : projectImages(p).length };

type Mode = 'choose' | 'import' | 'manual' | null;
export default function DeveloperDashboard() {
  const { activeWorkspaceId, loading } = useWorkspace();
  const navigate = useNavigate();
  const subscription = useDeveloperSubscription();
  if (loading || (activeWorkspaceId && subscription.isLoading)) return <FullPageLoading />;
  if (!subscription.data?.active) return <Navigate to="/" replace />;
  return <DeveloperDashboardContent />;
}

function DeveloperDashboardContent() {
  const { activeWorkspaceId: ws } = useWorkspace();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const onboarding = params.get('onboarding') === '1';
  const [mode, setMode] = useState<Mode>(() => params.get('import') === '1' || onboarding ? 'import' : null);
  const [editing, setEditing] = useState<DeveloperProject | undefined>();
  const [commissionProject, setCommissionProject] = useState<DeveloperProject | null>(null);
  const [companyPricing, setCompanyPricing] = useState(false);
  const [bulkPricing, setBulkPricing] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set());
  const [feeConfig, setFeeConfig] = useState<DeveloperCommissionConfig>({});
  const [savingFees, setSavingFees] = useState(false);
  useEffect(() => {
    if (params.get('import') === '1' || params.get('onboarding') === '1') setMode('import');
  }, [params]);
  useEffect(() => {
    const add = () => { setEditing(undefined); setMode('choose'); };
    window.addEventListener('developer-projects:add', add);
    return () => window.removeEventListener('developer-projects:add', add);
  }, []);
  useEffect(() => { setEditing(undefined); setExpandedId(null); setQuery(''); setPropFilter(EMPTY_PROPERTY_FILTER); setCommissionProject(null); setCompanyPricing(false); setBulkPricing(false); setSelectionMode(false); setSelectedProjects(new Set()); setSelectedUnits(new Set()); setFeeConfig({}); }, [ws]);
  const [query, setQuery] = useState('');
  const [deals, setDeals] = useState({ sale: true, rent: true });
  const [leadFilter, setLeadFilter] = useState(EMPTY_LEAD_FILTER);
  const [propFilter, setPropFilter] = useState(EMPTY_PROPERTY_FILTER);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleProject = (projectId: string, target: HTMLElement) => {
    const opening = expandedId !== projectId;
    const summary = target.closest<HTMLElement>('article, tr');
    setExpandedId(opening ? projectId : null);
    if (!opening || !summary) return;
    window.setTimeout(() => {
      const owner = summary.closest<HTMLElement>('[data-table-scroll], .realtyz-main-surface');
      if (!owner) return;
      const head = summary.closest('table')?.querySelector('thead');
      const top = Math.max(owner.getBoundingClientRect().top, head?.getBoundingClientRect().bottom ?? 0) + 8;
      owner.scrollTop += summary.getBoundingClientRect().top - top;
    }, 300);
  };
  const [grid, setGrid] = useState(() => { try { return localStorage.getItem('developer-projects-view') === 'grid'; } catch { return false; } });
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
    queryKey: ['developer-projects', ws], enabled: !!ws, refetchOnMount: 'always', refetchInterval: 30000,
    queryFn: async () => {
      if (!ws) return [];
      const projects: DeveloperProject[] = [];
      for (let from = 0; ; from += 500) {
        const { data, error } = await supabase.from('developer_projects').select('*').eq('workspace_owner_id', ws).order('created_at', { ascending: false }).order('id').range(from, from + 499);
        if (error) throw error;
        projects.push(...(data ?? []));
        if (!data || data.length < 500) {
          if (projects.length) return projects;
          // View-only demo developer: read the real inventory (no commissions/contacts) via a demo-only RPC.
          const demo = await supabase.rpc('demo_developer_projects');
          return Array.isArray(demo.data) ? demo.data as unknown as DeveloperProject[] : projects;
        }
      }
    },
  });
  const developer = editing ? companies.find(company => company.id === editing.developer_id) : companies[0];
  const developerFor = (project: DeveloperProject) => companies.find(company => company.id === project.developer_id) ?? companies[0];
  const filtered = useMemo(() => projects.filter(project => projectMatches(project, query, deals, propFilter)), [projects, query, deals, propFilter]);
  const selectedCount = selectedProjects.size + selectedUnits.size;
  const { isSuperAdmin } = useUserRole();
  const { type: demoType, loading: demoLoading } = useDemoViewStatus();
  const canRotate = !demoLoading && canRotateFirstTwoPhotos(isSuperAdmin, !!demoType);
  const toggleSelected = (setter: Dispatch<SetStateAction<Set<string>>>, key: string) => setter(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const columns = usePublicBoardColumns(`developer-projects:${ws ?? ''}`, filtered, PROJECT_COLUMNS);
  const cities = useMemo(() => [...new Set(projects.map(project => project.city).filter(Boolean) as string[])].sort(), [projects]);
  const neighborhoods = useMemo(() => [...new Set(projects.map(project => project.neighborhood).filter(Boolean) as string[])].sort(), [projects]);
  const propertyTypes = useMemo(() => [...new Set(projects.flatMap(project => savedProjectHierarchy(project).apartments.map(unit => unit.type)).filter((type): type is string => typeof type === 'string' && !!type))].sort(), [projects]);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['my-developer', ws] }); void qc.invalidateQueries({ queryKey: ['developer-projects', ws] }); void qc.invalidateQueries({ queryKey: ['sidebar-counts', ws] }); void qc.invalidateQueries({ queryKey: ['campaign-inventory', ws] }); };
  const openPricing = (project?: DeveloperProject) => {
    setBulkPricing(false); setCommissionProject(project ?? null); setCompanyPricing(!project);
    setFeeConfig(commissionConfig(project?.commission_config ?? companies[0]?.commission_config));
  };
  const openBulkPricing = () => {
    if (!selectionMode || !selectedCount) return;
    setCommissionProject(null); setCompanyPricing(false); setBulkPricing(true);
    setFeeConfig(commissionConfig(companies[0]?.commission_config));
  };
  const saveFees = async () => {
    if (!ws || savingFees) return;
    const errors = developerFeesErrors(feeConfig.defaults, 'sale', commissionProject?.price_from || 1);
    if (errors.length) { toast.error(`יש להשלים: ${errors.join(' · ')}`); return; }
    setSavingFees(true);
    try {
      if (bulkPricing) {
        const selected = projects.filter(project => selectedProjects.has(project.id) || savedProjectHierarchy(project).apartments.some(unit => selectedUnits.has(projectUnitSelectionKey(project.id, unit))));
        for (const project of selected) {
          const config = commissionForSelection(project, selectedProjects.has(project.id), selectedUnits, feeConfig.defaults!);
          const { error } = await supabase.from('developer_projects').update({ commission_config: config as unknown as Json }).eq('id', project.id).eq('workspace_owner_id', ws).select('id').single();
          if (error) throw error;
        }
        refresh(); setBulkPricing(false); setSelectedProjects(new Set()); setSelectedUnits(new Set()); setSelectionMode(false); toast.success(`העמלות נשמרו עבור ${selectedCount} פריטים`);
        return;
      }
      if (commissionProject) {
        const { error } = await supabase.from('developer_projects').update({ commission_config: feeConfig as unknown as Json }).eq('id', commissionProject.id).eq('workspace_owner_id', ws).select('id').single();
        if (error) throw error;
      } else {
        const company = companies[0]; if (!company) throw new Error('יש לשמור חברה תחילה');
        const { error } = await supabase.rpc('set_developer_company_commissions', { _company: company.id, _config: feeConfig as unknown as Json, _apply_existing: true });
        if (error) throw error;
      }
      refresh(); setCommissionProject(null); setCompanyPricing(false); toast.success('העמלות נשמרו');
    } catch { toast.error('שמירת העמלות נכשלה'); } finally { setSavingFees(false); }
  };
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
  const bulkRemove = useMutation({
    mutationFn: async () => {
      if (!ws || !selectionMode || !selectedCount) throw new Error('לא נבחרו פריטים');
      for (const projectId of selectedProjects) {
        const { error } = await supabase.from('developer_projects').delete().eq('id', projectId).eq('workspace_owner_id', ws).select('id').single();
        if (error) throw error;
      }
      const unitProjects = projects.filter(project => !selectedProjects.has(project.id) && savedProjectHierarchy(project).apartments.some(unit => selectedUnits.has(projectUnitSelectionKey(project.id, unit))));
      for (const project of unitProjects) {
        const patch = withoutSelectedUnits(project, selectedUnits);
        const { error } = await supabase.from('developer_projects').update({ apartments: patch.apartments as unknown as Json, commission_config: patch.commission_config as unknown as Json, source_details: patch.source_details as unknown as Json }).eq('id', project.id).eq('workspace_owner_id', ws).select('id').single();
        if (error) throw error;
      }
      return { projects: selectedProjects.size, units: selectedUnits.size };
    },
    onSuccess: result => { refresh(); setSelectedProjects(new Set()); setSelectedUnits(new Set()); setSelectionMode(false); toast.success(`נמחקו ${result.projects} פרויקטים ו־${result.units} דירות`); },
    onError: () => { refresh(); toast.error('המחיקה המרובה לא הושלמה. ייתכן שחלק מהפריטים עודכנו; הרשימה רועננה.'); },
  });
  const bulkRotate = useMutation({
    mutationFn: async () => {
      if (!selectionMode || !selectedCount) throw new Error('לא נבחרו פריטים');
      let total = 0;
      for (const projectId of selectedProjects) {
        const { data, error } = await supabase.rpc('admin_rotate_project_photos', { _project_id: projectId });
        if (error) throw error; total += Number((data as { total?: number })?.total ?? 0);
      }
      for (const project of projects) {
        if (selectedProjects.has(project.id)) continue;
        for (const unit of savedProjectHierarchy(project).apartments) {
          if (!selectedUnits.has(projectUnitSelectionKey(project.id, unit))) continue;
          const { data, error } = await supabase.rpc('admin_rotate_first_two_photos', { _scope: 'project_unit', _project_id: project.id, _unit_id: unit.source_unit_id, _building_id: unit.building_id ?? null });
          if (error) throw error; total += Number((data as { total?: number })?.total ?? 0);
        }
      }
      return total;
    },
    onSuccess: total => { refresh(); setSelectedProjects(new Set()); setSelectedUnits(new Set()); setSelectionMode(false); toast.success(total ? `סדר התמונות עודכן ב־${total} פריטים` : 'לא נמצאו פריטים עם יותר משתי תמונות'); },
    onError: () => { refresh(); toast.error('עדכון סדר התמונות לא הושלם'); },
  });
  const busy = !ws || isLoading || companiesLoading;
  const publish = useMutation({
    mutationFn: async ({ project, key }: { project: DeveloperProject; key?: string }) => {
      if (!ws || project.workspace_owner_id !== ws) throw new Error('יש לבחור סביבת עבודה');
      const { data, error } = await supabase.rpc('publish_developer_project', { _project: project.id, _unit_key: key });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { refresh(); void qc.invalidateQueries({ queryKey: ['public-listings'] }); toast.success('הפרסום בלוח הושלם'); },
    onError: (error) => toast.error(`הפרסום לא הושלם: ${error instanceof Error ? error.message : 'יש לבדוק מחיר, עמלות ומגבלות לכל יחידה'}`),
  });
  const publishProject = (project: DeveloperProject, key?: string) => { if (confirm(key ? 'לפרסם את היחידה בלוח הציבורי?' : 'לפרסם את הפרויקט וכל היחידות בלוח הציבורי?')) publish.mutate({ project, key }); };
  const postUnit = (project: DeveloperProject, unit: Parameters<typeof unitCommissionKey>[0]) => {
    const target = projectCampaignTargets(project).find(t => t.id.endsWith(`:unit:${encodeURIComponent(`${unit.building_id ?? ''}:${unit.source_unit_id}`)}`));
    if (target) navigate(`/campaigns?tab=create&listing=${encodeURIComponent(target.id)}&fresh=1`);
  };
  const actions = (p: DeveloperProject) => <div className="flex items-center gap-1" onClick={event => event.stopPropagation()}>
    <Button size="sm" variant="outline" disabled={publish.isPending} title="קידום הפרויקט בלוח הציבורי" onClick={() => { const errors = projectCommissionErrors(p); if (errors.length) { toast.error(`לפני פרסום יש להשלים: ${[...new Set(errors)].slice(0, 6).join(' · ')}`); openPricing(p); return; } publishProject(p); }}><Globe className="h-4 w-4" />פרסום בלוח</Button>
    <Button size="icon-sm" variant="ghost" aria-label={`יצירת קמפיין ${p.name}`} title="יצירת קמפיין" onClick={() => navigate(`/campaigns?tab=create&listing=${encodeURIComponent(`project:${p.id}`)}&fresh=1`)}><Megaphone /></Button>
    <Button size="icon-sm" variant="ghost" aria-label={`הגדרת עמלות ${p.name}`} title="עמלות ומגבלות" onClick={() => openPricing(p)}><Settings2 /></Button>
    <Button size="icon-sm" variant="ghost" aria-label="עריכת פרויקט" title="עריכת פרויקט" onClick={() => { setEditing(p); setMode('manual'); }}><Pencil /></Button>

    <Button size="icon-sm" variant="ghost" className="text-destructive" disabled={remove.isPending} title="מחיקת פרויקט" aria-label="מחיקת פרויקט" onClick={() => { if (confirm('למחוק את הפרויקט?')) remove.mutate(p.id); }}><Trash2 /></Button>
  </div>;
  const meta = (p: DeveloperProject) => { const h = savedProjectHierarchy(p); return [h.buildings.length ? `${h.buildings.length} בניינים` : '', h.apartments.length ? `${h.apartments.length} סוגי יחידות` : '', p.available_units ? `${p.available_units} זמינות` : ''].filter(Boolean); };
  return (
    <div dir="rtl" className={grid ? 'w-full min-w-0 space-y-5 py-4 [&>*:not(.grid)]:px-4 [&>.grid]:px-2' : 'listing-table-page flex h-full min-h-0 w-full min-w-0 flex-col gap-5 overflow-hidden py-4 [&>*:not(.board-full)]:px-4'}>
      {params.get('search') === '1' && <BoardSearchControls id="developer-project-search" hideViewToggle query={query} onQueryChange={setQuery} grid={grid} onViewToggle={toggleGrid} filter={<LeadTypeFilterButton hideLeadFilters state={leadFilter} onChange={setLeadFilter} propertyState={propFilter} onPropertyChange={setPropFilter} cities={cities} neighborhoods={neighborhoods} propertyTypes={propertyTypes} />} />}
      {busy ? <div role="status" className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /><span className="sr-only">טוען פרויקטים</span></div>
      : projectError || companyError ? <div role="alert" className="space-y-3 py-8 text-center"><p className="text-lg text-destructive">לא ניתן לטעון את הפרויקטים</p><Button variant="outline" onClick={refresh}>ניסיון נוסף</Button></div>
      : projects.length === 0 ? <section className="flex flex-col items-center gap-3 py-16 text-center"><Building2 className="h-12 w-12 text-muted-foreground/50" /><h2 className="text-xl font-semibold">עדיין אין פרויקטים</h2><p className="text-base text-muted-foreground">ייבוא מיד2 נשמר אוטומטית ברקע, פרויקט אחר פרויקט.</p><div className="flex gap-2"><Button onClick={() => setMode('import')}><FileDown className="h-4 w-4" />ייבוא מיד2</Button><Button variant="outline" onClick={() => { setEditing(undefined); setMode('manual'); }}><Pencil className="h-4 w-4" />יצירה ידנית</Button></div></section>
      : <>
        <div data-developer-toolbar className="flex w-full min-w-0 flex-nowrap items-center gap-1 sm:gap-3">
          {companies[0] && <PublicIdentityLink className="shrink-0" userId={companies[0].owner_user_id} label={`פתיחת הפרופיל של ${companies[0].company_name}`}><DeveloperLogo name={companies[0].company_name} logoUrl={companies[0].logo_url} className="h-16 w-16 sm:h-20 sm:w-20" /></PublicIdentityLink>}
          <PublicIdentityLink userId={companies[0]?.owner_user_id} className="min-w-0 flex-1 truncate font-semibold">{companies[0]?.company_name}</PublicIdentityLink>
          <Button variant="ghost" size="icon" className="shrink-0" aria-label="סנכרון מיד2" title="סנכרון מיד2" onClick={() => setMode('import')}><FileDown className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="shrink-0" onClick={toggleGrid} aria-label={grid ? 'תצוגת רשימה' : 'תצוגת כרטיסים'} title={grid ? 'תצוגת רשימה' : 'תצוגת כרטיסים'}>{grid ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}</Button>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2"><SelectModeToggle total={filtered.length} active={selectionMode} count={selectedCount} closeAction onToggle={() => { setSelectionMode(value => !value); setSelectedProjects(new Set()); setSelectedUnits(new Set()); }} onSelectAll={() => setSelectedProjects(new Set(filtered.map(project => project.id)))} /><span aria-label="סך הפרויקטים" className="shrink-0 whitespace-nowrap rounded-full border border-border bg-muted px-2 py-1 text-sm font-semibold">{projects.length} פרויקטים</span></div>
          <div className="flex flex-wrap items-center gap-2">{selectionMode && selectedCount > 0 && canRotate && <Button variant="outline" disabled={bulkRotate.isPending} onClick={() => { if (confirm(`להעביר את 2 התמונות הראשונות לסוף ב־${selectedProjects.size} פרויקטים ו־${selectedUnits.size} דירות שנבחרו?`)) bulkRotate.mutate(); }}>{bulkRotate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Images className="h-4 w-4" />}העבר 2 תמונות ראשונות לסוף</Button>}{selectionMode && selectedCount > 0 && <Button variant="outline" className="text-destructive" disabled={bulkRemove.isPending} onClick={() => { if (confirm(`למחוק ${selectedProjects.size} פרויקטים ו־${selectedUnits.size} דירות?`)) bulkRemove.mutate(); }}>{bulkRemove.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}מחיקה מרובה</Button>}<Button variant="outline" onClick={selectionMode && selectedCount ? openBulkPricing : () => openPricing()}><span aria-hidden className="text-base font-bold leading-none">₪</span>הגדרת עמלות ותגמולים</Button></div>
        </div>
        {filtered.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">לא נמצאו פרויקטים מתאימים</p> : grid ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(p => { const open = expandedId === p.id; const deal = projectDeal(p); return <article key={p.id} className={cn('flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md', open && 'sm:col-span-2 lg:col-span-3')}>
            <div className="flex flex-wrap items-start gap-2 p-3"><div className="min-w-0 w-full"><div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3"><h2 className="min-w-0 whitespace-normal [overflow-wrap:anywhere] text-[19px] font-bold leading-snug">{p.name}</h2>{priceLabel(p.price_from) && <p className={cn('shrink-0 whitespace-nowrap text-[17px] font-bold', deal === 'rent' ? 'text-sale' : 'text-success')}>{priceLabel(p.price_from)}</p>}</div><p className="mt-1 truncate text-sm text-muted-foreground">{[p.city, p.neighborhood].filter(Boolean).join(' · ')}</p></div>{selectionMode && <SelectBox checked={selectedProjects.has(p.id)} onChange={() => toggleSelected(setSelectedProjects, p.id)} label={`בחירת הפרויקט ${p.name}`} />}{actions(p)}</div>
            <div className="px-3 pb-2"><ProjectStatusCell project={p} hasImages={projectImages(p).length > 0} stage={PROJECT_STATUS[p.status] ?? p.status} /></div>
            <PropertyGallerySlider photos={projectImages(p)} alt={p.name} overlay={<span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{PROJECT_STATUS[p.status] ?? p.status}</span>} />
            <div className="flex flex-1 flex-col gap-3 p-4">
              <ProjectTimelineBar compact timeline={(p as { timeline?: unknown }).timeline} />
              <DeveloperCommissionBadges project={p} onEdit={() => openPricing(p)} />
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">{meta(p).map(item => <span key={item} className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5 text-primary" />{item}</span>)}</div>
              <Button variant="outline" className="mt-auto justify-between" aria-expanded={open} onClick={event => toggleProject(p.id, event.currentTarget)}>בניינים ויחידות<ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} /></Button>
              <AnimatedExpansion open={open} autoReveal={false}><ProjectHierarchyDetails enlarged project={p} developer={developerFor(p)} grid={grid} onPublish={unit => publishProject(p, unitCommissionKey(unit))} onPost={unit => postUnit(p, unit)} onEdit={() => { setEditing(p); setMode('manual'); }} selectionMode={selectionMode} selectedUnits={selectedUnits} onToggleUnit={key => toggleSelected(setSelectedUnits, key)} /></AnimatedExpansion>
            </div>
          </article>; })}
        </div> : <BoardColumnDragArea controls={columns}><HorizontalTableScroll className="board-full listing-results-scroll board-head-sticky flex-1 rounded-none border-0"><table className="w-full text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr>{selectionMode && <th className="w-8 p-2"><span className="sr-only">בחירה</span></th>}{columns.visible.map((id) => <BoardColumnHeader key={id} id={id} controls={columns} />)}<th className="p-2"><BoardColumnMenu controls={columns} /></th></tr></thead><tbody>
          {columns.sorted.flatMap(p => { const open = expandedId === p.id; const deal = projectDeal(p); const hierarchy = savedProjectHierarchy(p); return [<tr key={p.id} tabIndex={0} aria-expanded={open} onClick={() => setExpandedId(open ? null : p.id)} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setExpandedId(open ? null : p.id); } }} className="cursor-pointer border-t hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {selectionMode && <td className="p-2"><SelectBox checked={selectedProjects.has(p.id)} onChange={() => toggleSelected(setSelectedProjects, p.id)} label={`בחירת הפרויקט ${p.name}`} /></td>}
            {columns.visible.map(id => <td key={id} data-column={id} className={cn('p-2', id === 'price' && 'text-right whitespace-nowrap font-bold max-sm:sticky max-sm:left-0 max-sm:z-[3] max-sm:bg-card', id === 'price' && (deal === 'rent' ? 'text-sale' : 'text-success'))}>
              {id === 'photo' ? projectImages(p)[0] ? <img src={projectImages(p)[0]} alt="" className="h-12 w-12 rounded object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded bg-muted"><Building2 className="h-5 w-5 text-muted-foreground" /></div>
              : id === 'address' ? <div className="min-w-[8rem] max-w-64"><strong className="block whitespace-normal [overflow-wrap:anywhere]">{p.name}</strong><span className="block break-words text-xs text-muted-foreground">{[p.city, p.neighborhood].filter(Boolean).join(' · ')}</span></div>
              : id === 'price' ? priceLabel(p.price_from)
              : id === 'commissions' ? <DeveloperCommissionBadges project={p} onEdit={() => openPricing(p)} /> : id === 'rooms' ? hierarchy.apartments.length || '' : <ProjectStatusCell project={p} hasImages={projectImages(p).length > 0} stage={PROJECT_STATUS[p.status] ?? p.status} />}
            </td>)}
            <td className="p-2"><div className="flex items-center">{actions(p)}<Button variant="ghost" size="icon-sm" aria-label={`בניינים ויחידות ${p.name}`} aria-expanded={open} onClick={event => { event.stopPropagation(); setExpandedId(open ? null : p.id); }}><ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} /></Button></div></td>
          </tr>, <tr key={`${p.id}-details`}><td colSpan={columns.visible.length + 1 + (selectionMode ? 1 : 0)} className="p-0"><FixedTablePanel><AnimatedExpansion open={open} autoReveal={false}><div className="min-w-0 space-y-4 p-4"><PropertyGallerySlider photos={projectImages(p)} alt={p.name} /><ProjectHierarchyDetails enlarged project={p} developer={developerFor(p)} grid={grid} onPublish={unit => publishProject(p, unitCommissionKey(unit))} onPost={unit => postUnit(p, unit)} onEdit={() => { setEditing(p); setMode('manual'); }} selectionMode={selectionMode} selectedUnits={selectedUnits} onToggleUnit={key => toggleSelected(setSelectedUnits, key)} /></div></AnimatedExpansion></FixedTablePanel></td></tr>]; })}
        </tbody></table></HorizontalTableScroll></BoardColumnDragArea>}
      </>}
      <Dialog open={mode !== null} onOpenChange={open => { if (!open) close(); }}>
        <DialogContent dir="rtl" className="max-h-[92dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-lg p-4 sm:p-6">
          <DialogHeader><DialogTitle className="text-2xl">{editing ? 'עריכת פרויקט' : mode === 'import' ? 'ייבוא מיד2' : 'יצירת פרויקט'}</DialogTitle><DialogDescription className="sr-only">פרטי החברה והפרויקט</DialogDescription></DialogHeader>
          {mode === 'choose' && <div className="grid gap-3 py-5 sm:grid-cols-2">
            <Button variant="outline" className="h-24 gap-3 text-lg" onClick={() => setMode('import')}><FileDown />ייבוא מיד2</Button>
            <Button variant="outline" className="h-24 gap-3 text-lg" onClick={() => setMode('manual')}><Pencil />יצירה ידנית</Button>
          </div>}
          {mode === 'import' && <div className="space-y-4"><DeveloperYad2Import onSaved={saved} initialUrl={companies[0]?.source_url ?? null} developerId={companies[0]?.id ?? null} /><Button variant="ghost" onClick={() => setMode('manual')}>יצירה ידנית</Button></div>}
          {mode === 'manual' && !busy && <DeveloperProjectWizard key={`${ws}-${editing?.id ?? 'new'}`} project={editing} company={developer} onSaved={saved} onCancel={close} />}
        </DialogContent>
      </Dialog>
      <Dialog open={companyPricing || !!commissionProject || bulkPricing} onOpenChange={open => { if (!open && !savingFees) { setCompanyPricing(false); setCommissionProject(null); setBulkPricing(false); } }}><DialogContent dir="rtl" className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{bulkPricing ? `עמלות ל־${selectedCount} פריטים נבחרים` : commissionProject ? `עמלות ${commissionProject.name}` : 'עמלות החברה לכל הפרויקטים'}</DialogTitle><DialogDescription>{bulkPricing ? 'השמירה תחיל את התמחור על הפרויקטים והדירות שנבחרו בלבד, בלי לשנות את שאר המלאי.' : commissionProject ? 'ברירת מחדל לפרויקט והתאמות ליחידות' : 'שמירה תחיל את ברירת המחדל על כל פרויקטי החברה, בלי לשנות התאמות אישיות ליחידות. מודעות שכבר פורסמו יתעדכנו רק בפרסום מחדש.'}</DialogDescription></DialogHeader><DeveloperCommissionEditor key={bulkPricing ? 'bulk' : commissionProject?.id ?? 'company'} value={feeConfig} units={commissionProject && !bulkPricing ? savedProjectHierarchy(commissionProject).apartments : []} price={commissionProject?.price_from || 0} deal="sale" onChange={setFeeConfig} /><Button disabled={savingFees} onClick={() => void saveFees()}>{savingFees && <Loader2 className="animate-spin" />}שמירת עמלות</Button></DialogContent></Dialog>
    </div>
  );
}
