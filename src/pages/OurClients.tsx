import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ChevronDown, Layers, LayoutGrid, List, Loader2 } from 'lucide-react';
import { DeveloperLogo } from '@/components/developers/DeveloperLogo';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import BoardSearchControls from '@/components/public/BoardSearchControls';
import LeadTypeFilterButton from '@/components/affiliate/LeadTypeFilterButton';
import PropertyGallerySlider from '@/components/public/PropertyGallerySlider';
import ProjectTimelineBar from '@/components/developers/ProjectTimelineBar';
import ProjectHierarchyDetails from '@/components/developers/ProjectHierarchyDetails';
import { AnimatedExpansion } from '@/components/ui/animated-expansion';
import { EMPTY_LEAD_FILTER, EMPTY_PROPERTY_FILTER } from '@/lib/leadTypeFilter';
import { developerProjectImages, projectDeal, projectMatches, savedProjectHierarchy } from '@/lib/developerProjectBoard';
import { PROJECT_STATUS, type DeveloperProject } from '@/lib/developerProjectForm';
import { cn } from '@/lib/utils';

type Client = { id: string; name: string | null; logo_url: string | null; projects: number; units: number };
const priceLabel = (price?: number | null) => price && price > 0 ? `החל מ־₪${Number(price).toLocaleString('he-IL')}` : '';

function useViewToggle(key: string) {
  const [grid, setGrid] = useState(() => { try { return localStorage.getItem(key) !== 'list'; } catch { return true; } });
  const toggle = () => setGrid(v => { try { localStorage.setItem(key, v ? 'list' : 'grid'); } catch { /* storage unavailable */ } return !v; });
  return [grid, toggle] as const;
}

/** Marketing-company home: assigned developers → projects (read-only), using the same cards/controls as My Projects. */
export default function OurClients() {
  const [dev, setDev] = useState<Client | null>(null);
  const [query, setQuery] = useState('');
  const [propFilter, setPropFilter] = useState(EMPTY_PROPERTY_FILTER);
  const [leadFilter, setLeadFilter] = useState(EMPTY_LEAD_FILTER);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [grid, toggleGrid] = useViewToggle('our-clients-view');
  const clients = useQuery({ queryKey: ['marketing-clients'], queryFn: async () => {
    const { data, error } = await supabase.rpc('marketing_my_clients');
    if (error) throw error; return data as unknown as { company: string; clients: Client[] };
  } });
  const projects = useQuery({ queryKey: ['marketing-client-projects', dev?.id], enabled: !!dev, queryFn: async () => {
    const { data, error } = await supabase.rpc('marketing_client_projects', { _developer: dev!.id });
    if (error) throw error; return (data as unknown as { projects: DeveloperProject[] }).projects;
  } });
  const list = projects.data ?? [];
  const filteredProjects = useMemo(() => list.filter(p => projectMatches(p, query, { sale: true, rent: true }, propFilter)), [list, query, propFilter]);
  const filteredClients = useMemo(() => (clients.data?.clients ?? []).filter(c => !query.trim() || (c.name ?? '').includes(query.trim())), [clients.data, query]);
  const cities = useMemo(() => [...new Set(list.map(p => p.city).filter(Boolean) as string[])].sort(), [list]);
  const neighborhoods = useMemo(() => [...new Set(list.map(p => p.neighborhood).filter(Boolean) as string[])].sort(), [list]);
  const open = (c: Client | null) => { setDev(c); setQuery(''); setExpandedId(null); setPropFilter(EMPTY_PROPERTY_FILTER); };
  const meta = (p: DeveloperProject) => { const h = savedProjectHierarchy(p); return [h.buildings.length ? `${h.buildings.length} בניינים` : '', h.apartments.length ? `${h.apartments.length} סוגי יחידות` : '', p.available_units ? `${p.available_units} זמינות` : ''].filter(Boolean); };

  return <div dir="rtl" className="w-full min-w-0 space-y-5 py-4 [&>*:not(.grid)]:px-4 [&>.grid]:px-2">
    <div className="flex w-full min-w-0 items-center gap-2">
      {dev && <Button size="icon" variant="ghost" aria-label="חזרה" onClick={() => open(null)}><ArrowRight className="h-5 w-5" /></Button>}
      {dev && <DeveloperLogo name={dev.name} logoUrl={dev.logo_url} className="h-16 w-16" />}
      <div className="min-w-0 flex-1"><h2 className="truncate text-2xl font-bold text-foreground">{dev?.name || 'הלקוחות שלנו'}</h2>{!dev && clients.data?.company && <p className="text-muted-foreground">{clients.data.company}</p>}</div>
      <span className="shrink-0 whitespace-nowrap rounded-full border border-border bg-muted px-2 py-1 text-sm font-semibold">{dev ? `${list.length} פרויקטים` : `${clients.data?.clients.length ?? 0} יזמים`}</span>
      <Button variant="ghost" size="icon" className="shrink-0" onClick={toggleGrid} aria-label={grid ? 'תצוגת רשימה' : 'תצוגת כרטיסים'} title={grid ? 'תצוגת רשימה' : 'תצוגת כרטיסים'}>{grid ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}</Button>
    </div>
    <BoardSearchControls id="our-clients-search" hideViewToggle query={query} onQueryChange={setQuery} grid={grid} onViewToggle={toggleGrid}
      filter={dev ? <LeadTypeFilterButton hideLeadFilters state={leadFilter} onChange={setLeadFilter} propertyState={propFilter} onPropertyChange={setPropFilter} cities={cities} neighborhoods={neighborhoods} propertyTypes={[]} /> : undefined} />

    {!dev && (clients.isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /> : clients.isError ? <p role="alert" className="text-destructive">החשבון אינו משויך לחברת שיווק.</p>
      : !filteredClients.length ? <p className="py-16 text-center text-muted-foreground">לא נמצאו יזמים</p>
      : <div className={grid ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-2'}>{filteredClients.map(c =>
        <button key={c.id} type="button" onClick={() => open(c)} className={cn('flex w-full min-w-0 items-center gap-3 rounded-lg border bg-card p-3 text-right shadow-xs transition-shadow hover:shadow-md', grid && 'flex-col items-start')}>
          <DeveloperLogo name={c.name} logoUrl={c.logo_url} className={grid ? 'h-20 w-20' : 'h-12 w-12'} />
          <div className="min-w-0"><p className="truncate text-[19px] font-bold">{c.name || 'יזם'}</p><p className="text-sm text-muted-foreground">{c.projects} פרויקטים · {c.units} דירות</p></div>
        </button>)}</div>)}

    {dev && (projects.isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /> : projects.isError ? <p role="alert" className="text-destructive">טעינת הפרויקטים נכשלה</p>
      : !filteredProjects.length ? <p className="py-16 text-center text-sm text-muted-foreground">לא נמצאו פרויקטים מתאימים</p>
      : <div className={grid ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-3'}>{filteredProjects.map(p => { const isOpen = expandedId === p.id; const deal = projectDeal(p); const photos = developerProjectImages(p); return <article key={p.id} className={cn('flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-xs transition-shadow hover:shadow-md', isOpen && grid && 'sm:col-span-2 lg:col-span-3')}>
        <div className="p-3"><div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3"><h3 className="min-w-0 [overflow-wrap:anywhere] text-[19px] font-bold leading-snug">{p.name}</h3>{priceLabel(p.price_from) && <p className={cn('shrink-0 whitespace-nowrap text-[17px] font-bold', deal === 'rent' ? 'text-sale' : 'text-success')}>{priceLabel(p.price_from)}</p>}</div><p className="mt-1 truncate text-sm text-muted-foreground">{[p.city, p.neighborhood].filter(Boolean).join(' · ')}</p></div>
        {grid && <PropertyGallerySlider photos={photos} alt={p.name} overlay={<span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{PROJECT_STATUS[p.status] ?? p.status}</span>} />}
        <div className="flex flex-1 flex-col gap-3 p-4">
          <ProjectTimelineBar compact timeline={(p as { timeline?: unknown }).timeline} />
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">{meta(p).map(item => <span key={item} className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5 text-primary" />{item}</span>)}</div>
          <Button variant="outline" className="mt-auto justify-between" aria-expanded={isOpen} onClick={() => setExpandedId(isOpen ? null : p.id)}>בניינים ויחידות<ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} /></Button>
          <AnimatedExpansion open={isOpen} autoReveal={false}><div className="space-y-4">{!grid && <PropertyGallerySlider photos={photos} alt={p.name} />}<ProjectHierarchyDetails enlarged project={p} /></div></AnimatedExpansion>
        </div>
      </article>; })}</div>)}
  </div>;
}
