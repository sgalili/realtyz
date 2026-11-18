import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Client = { id: string; name: string | null; logo_url: string | null; projects: number; units: number };
type Apartment = { source_unit_id?: string; type?: string; rooms?: number | null; floor?: number | null; size_sqm?: number | null; price?: number | null; address?: string | null; source_url?: string | null; images?: string[] };
type Project = { id: string; name: string | null; city: string | null; neighborhood: string | null; address: string | null; status: string | null; total_units: number | null; available_units: number | null; price_from: number | null; delivery_date: string | null; image_url: string | null; source_url: string | null; apartments: Apartment[] };

const ils = (n?: number | null) => (n ? `₪${Number(n).toLocaleString('he-IL')}` : null);
const Yad2Link = ({ url }: { url?: string | null }) => url ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary underline underline-offset-4">יד 2<ExternalLink className="h-3.5 w-3.5" /></a> : null;

/** Marketing-company home: assigned developers → their projects → apartments (read-only). */
export default function OurClients() {
  const [dev, setDev] = useState<Client | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const clients = useQuery({ queryKey: ['marketing-clients'], queryFn: async () => {
    const { data, error } = await supabase.rpc('marketing_my_clients');
    if (error) throw error; return data as unknown as { company: string; clients: Client[] };
  } });
  const projects = useQuery({ queryKey: ['marketing-client-projects', dev?.id], enabled: !!dev, queryFn: async () => {
    const { data, error } = await supabase.rpc('marketing_client_projects', { _developer: dev!.id });
    if (error) throw error; return (data as unknown as { projects: Project[] }).projects;
  } });
  const back = project ? () => setProject(null) : dev ? () => setDev(null) : null;
  const title = project?.name || dev?.name || 'הלקוחות שלנו';

  return <div dir="rtl" className="mx-auto w-full max-w-5xl space-y-4 p-4 text-right">
    <div className="flex items-center gap-2">
      {back && <Button size="icon" variant="ghost" aria-label="חזרה" onClick={back}><ArrowRight className="h-5 w-5" /></Button>}
      <div className="min-w-0"><h2 className="truncate text-2xl font-bold text-foreground">{title}</h2>{!dev && clients.data?.company && <p className="text-muted-foreground">{clients.data.company}</p>}</div>
    </div>

    {!dev && (clients.isLoading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : clients.isError ? <p role="alert" className="text-destructive">החשבון אינו משויך לחברת שיווק.</p> :
      !clients.data?.clients.length ? <p className="text-muted-foreground">עדיין לא שויכו יזמים לחברת השיווק.</p> :
      <ul className="grid gap-3 sm:grid-cols-2">{clients.data.clients.map(c => <li key={c.id}>
        <button type="button" onClick={() => setDev(c)} className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-right hover:bg-accent">
          {c.logo_url ? <img src={c.logo_url} alt="" className="h-12 w-12 rounded-md object-contain" /> : <Building2 className="h-10 w-10 text-muted-foreground" />}
          <div className="min-w-0"><p className="truncate text-lg font-semibold">{c.name || 'יזם'}</p><p className="text-sm text-muted-foreground">{c.projects} פרויקטים · {c.units} דירות</p></div>
        </button></li>)}</ul>)}

    {dev && !project && (projects.isLoading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : projects.isError ? <p role="alert" className="text-destructive">טעינת הפרויקטים נכשלה</p> :
      !projects.data?.length ? <p className="text-muted-foreground">אין פרויקטים ליזם זה.</p> :
      <ul className="grid gap-3 sm:grid-cols-2">{projects.data.map(p => <li key={p.id} className="overflow-hidden rounded-xl border bg-card">
        <button type="button" onClick={() => setProject(p)} className="block w-full text-right">
          {p.image_url && <img src={p.image_url} alt="" className="h-36 w-full object-cover" loading="lazy" />}
          <div className="space-y-1 p-3"><p className="text-lg font-semibold">{p.name || 'פרויקט'}</p>
            <p className="text-sm text-muted-foreground">{[p.neighborhood, p.city].filter(Boolean).join(', ')}</p>
            <div className="flex flex-wrap gap-2 text-sm">{p.price_from ? <Badge variant="secondary">החל מ־{ils(p.price_from)}</Badge> : null}<Badge variant="secondary">{p.apartments.length} דירות</Badge>{p.total_units ? <Badge variant="outline">{p.total_units} יחידות בפרויקט</Badge> : null}</div>
          </div>
        </button>
        <div className="px-3 pb-3"><Yad2Link url={p.source_url} /></div>
      </li>)}</ul>)}

    {project && <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-muted-foreground">{[project.address, project.city].filter(Boolean).join(', ')}{project.delivery_date && <span>· אכלוס {project.delivery_date}</span>}<Yad2Link url={project.source_url} /></div>
      {!project.apartments.length ? <p className="text-muted-foreground">לא נמצאו דירות פרטניות שפורסמו ביד 2 לפרויקט זה.</p> :
      <ul className="space-y-2">{project.apartments.map((a, i) => <li key={a.source_unit_id ?? i} className="flex items-center gap-3 rounded-xl border bg-card p-3">
        {a.images?.[0] && <img src={a.images[a.images.length > 4 ? 4 : 0]} alt="" className="h-16 w-20 shrink-0 rounded-md object-cover" loading="lazy" />}
        <div className="min-w-0 flex-1"><p className="font-semibold">{[a.rooms && `${a.rooms} חדרים`, a.size_sqm && `${a.size_sqm} מ״ר`, a.floor != null && `קומה ${a.floor}`].filter(Boolean).join(' · ') || 'דירה'}</p>
          <p className="truncate text-sm text-muted-foreground">{a.address}</p></div>
        <div className="flex shrink-0 flex-col items-end gap-1"><span className="font-semibold">{ils(a.price) ?? 'מחיר לא פורסם'}</span><Yad2Link url={a.source_url} /></div>
      </li>)}</ul>}
    </div>}
  </div>;
}
